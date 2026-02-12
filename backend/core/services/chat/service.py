# backend/core/services/chat/service.py
"""
AI 聊天服务 - ChatService
职责:
1. 管理用户的聊天会话 (Session Management)
2. 与 Google Gemini API 通信
3. 持久化聊天历史
"""

import os
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path

from django.conf import settings

from core.sys.logger import get_audit_logger

audit_logger = get_audit_logger()

# 可选导入 Google Generative AI
try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    genai = None
    GENAI_AVAILABLE = False
    audit_logger.warning("google-generativeai 未安装，AI 功能将不可用。运行 'pip install google-generativeai' 安装。")


class ChatService:
    """AI 聊天服务"""
    
    # Gemini 模型配置 - 使用最新可用的模型
    GEMINI_MODEL = "gemini-2.0-flash"
    
    def __init__(self, username: str):
        self.username = username
        
        # 存储路径
        self.storage_dir = Path(settings.BASE_DIR) / "core" / "memory" / "chat_history"
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.file_path = self.storage_dir / f"chat_{self.username}.json"
        
        # 内存缓存
        self.data = self._load_data()
        
        # 初始化 Gemini API
        self.model = None
        self._init_gemini()
    
    def _init_gemini(self):
        """初始化 Google Gemini API"""
        if not GENAI_AVAILABLE:
            return
            
        api_key = os.environ.get("GOOGLE_API_KEY") or getattr(settings, 'GOOGLE_API_KEY', None)
        if api_key:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel(self.GEMINI_MODEL)
        else:
            audit_logger.warning("GOOGLE_API_KEY 未配置，AI 功能将不可用")
    
    def _load_data(self) -> Dict[str, Any]:
        """加载 JSON 数据"""
        if not self.file_path.exists():
            return {"sessions": {}, "active_session_id": None}
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"sessions": {}, "active_session_id": None}
    
    def _save_data(self):
        """持久化到磁盘"""
        with open(self.file_path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)
    
    # =========================================================================
    # 会话管理 (Session Management)
    # =========================================================================
    
    def get_all_sessions(self) -> List[Dict]:
        """获取所有会话列表 (按更新时间倒序)"""
        sessions = []
        for s_id, s_data in self.data["sessions"].items():
            sessions.append({
                "id": s_id,
                "title": s_data.get("title", "新对话"),
                "updated_at": s_data.get("updated_at", ""),
                "message_count": len(s_data.get("messages", []))
            })
        return sorted(sessions, key=lambda x: x["updated_at"], reverse=True)
    
    def create_session(self, title: str = "新对话") -> str:
        """创建新会话"""
        session_id = str(uuid.uuid4())
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        self.data["sessions"][session_id] = {
            "title": title,
            "created_at": timestamp,
            "updated_at": timestamp,
            "messages": []
        }
        self.data["active_session_id"] = session_id
        self._save_data()
        return session_id
    
    def delete_session(self, session_id: str) -> bool:
        """删除会话"""
        if session_id in self.data["sessions"]:
            del self.data["sessions"][session_id]
            if self.data["active_session_id"] == session_id:
                self.data["active_session_id"] = None
            self._save_data()
            return True
        return False
    
    def set_active_session(self, session_id: str) -> bool:
        """切换当前会话"""
        if session_id in self.data["sessions"]:
            self.data["active_session_id"] = session_id
            self._save_data()
            return True
        return False
    
    def get_active_session(self) -> Dict:
        """获取当前活跃会话"""
        active_id = self.data.get("active_session_id")
        if not active_id or active_id not in self.data["sessions"]:
            active_id = self.create_session()
        
        return {
            "id": active_id,
            "data": self.data["sessions"][active_id]
        }
    
    def get_session(self, session_id: str) -> Optional[Dict]:
        """获取指定会话"""
        if session_id in self.data["sessions"]:
            return {
                "id": session_id,
                "data": self.data["sessions"][session_id]
            }
        return None
    
    # =========================================================================
    # 消息管理 (Message Handling)
    # =========================================================================
    
    def add_message(self, session_id: str, role: str, content: str) -> bool:
        """追加消息"""
        if session_id not in self.data["sessions"]:
            return False
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        msg = {"role": role, "content": content, "time": timestamp}
        
        self.data["sessions"][session_id]["messages"].append(msg)
        self.data["sessions"][session_id]["updated_at"] = timestamp
        
        # 自动生成标题 (第一条用户消息)
        msgs = self.data["sessions"][session_id]["messages"]
        if len(msgs) == 1 and role == "user":
            new_title = content[:30] + "..." if len(content) > 30 else content
            self.data["sessions"][session_id]["title"] = new_title
        
        self._save_data()
        return True
    
    def get_messages(self, session_id: str) -> List[Dict]:
        """获取会话消息列表"""
        if session_id in self.data["sessions"]:
            return self.data["sessions"][session_id].get("messages", [])
        return []
    
    # =========================================================================
    # AI 对话 (Gemini Integration)
    # =========================================================================
    
    def send_message(self, session_id: str, user_message: str) -> Dict:
        """
        发送消息并获取 AI 回复
        
        Returns:
            {
                "success": bool,
                "response": str,
                "error": str (如果失败)
            }
        """
        if not self.model:
            return {
                "success": False,
                "response": "",
                "error": "AI 服务未配置，请联系管理员设置 GOOGLE_API_KEY"
            }
        
        # 添加用户消息
        self.add_message(session_id, "user", user_message)
        
        try:
            # 构建对话历史
            messages = self.get_messages(session_id)
            
            # 转换为 Gemini 格式
            history = []
            for msg in messages[:-1]:  # 排除最后一条 (刚添加的用户消息)
                role = "user" if msg["role"] == "user" else "model"
                history.append({"role": role, "parts": [msg["content"]]})
            
            # 创建对话
            chat = self.model.start_chat(history=history)
            
            # 发送消息并获取回复
            response = chat.send_message(user_message)
            ai_response = response.text
            
            # 保存 AI 回复
            self.add_message(session_id, "assistant", ai_response)
            
            # 审计日志
            audit_logger.info(
                "AI 对话",
                extra={
                    "user": self.username,
                    "func": "AI:Chat",
                    "action": "SEND_MESSAGE",
                    "details": f"Session: {session_id[:8]}..."
                }
            )
            
            return {
                "success": True,
                "response": ai_response,
                "error": ""
            }
            
        except Exception as e:
            error_msg = str(e)
            audit_logger.error(f"AI 对话失败: {error_msg}", extra={"user": self.username})
            
            # 友好的错误消息
            user_error = "AI 服务暂时不可用，请稍后重试"
            if "429" in error_msg or "quota" in error_msg.lower():
                user_error = "AI 服务请求超限，请稍后再试（约1分钟后）"
            elif "404" in error_msg:
                user_error = "AI 模型不可用，请联系管理员"
            elif "401" in error_msg or "403" in error_msg:
                user_error = "API 认证失败，请检查配置"
            
            return {
                "success": False,
                "response": "",
                "error": user_error
            }
    
    def is_available(self) -> bool:
        """检查 AI 服务是否可用"""
        return self.model is not None

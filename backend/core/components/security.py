# core/components/security.py
"""
文件说明: 安全加密工具箱 (Security Toolkit)
主要功能:
1. 提供无状态的密码哈希加密 (PBKDF2-SHA256)。
2. 提供密码校验逻辑 (防止时序攻击)。
3. 生成安全的随机会话令牌 (UUID)。
"""

import os
import base64
import hashlib
import hmac
import uuid


class SecurityUtils:
    """
    [底层组件] 安全加密工具箱
    """

    @staticmethod
    def hash_password(password: str) -> str:
        """
        使用 PBKDF2-SHA256 算法对密码进行哈希加密。
        格式: pbkdf2_sha256$iterations$salt$hash
        """
        if not password:
            raise ValueError("密码不能为空")

        # 生成随机盐 (16 bytes)
        salt = os.urandom(16)
        iterations = 120000

        # 计算哈希
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)

        # Base64 编码以便存储
        salt_b64 = base64.b64encode(salt).decode("ascii")
        hash_b64 = base64.b64encode(dk).decode("ascii")

        return f"pbkdf2_sha256${iterations}${salt_b64}${hash_b64}"

    @staticmethod
    def verify_password(password: str, stored_hash: str) -> bool:
        """
        校验明文密码与存储的哈希值是否匹配。
        """
        try:
            if not stored_hash or "$" not in stored_hash:
                return False

            alg, iter_str, salt_b64, hash_b64 = stored_hash.split("$")

            if alg != "pbkdf2_sha256":
                return False

            salt = base64.b64decode(salt_b64.encode("ascii"))
            stored_dk = base64.b64decode(hash_b64.encode("ascii"))

            dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iter_str))

            # 使用恒定时间比较 (compare_digest)，防止时序攻击
            return hmac.compare_digest(dk, stored_dk)
        except Exception:
            return False

    @staticmethod
    def generate_token() -> str:
        """生成唯一会话令牌"""
        return str(uuid.uuid4())
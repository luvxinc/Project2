# core/services/security/inventory.py
"""
文件说明: 权限资产盘点服务 (Security Inventory Service) - V3.0 三层结构
主要功能:
1. [整合数据源] 将 modules.json (导航) 和 action_registry.json (动作) 合并。
2. [构建层级] 生成 Module -> Submodule -> Tab -> Action 的四级权限树。
3. [Fix] 过滤冲突: 严格排除 'admin_only' 和 'public'。
"""

from typing import List, Dict, Any
from backend.common.settings import settings


class SecurityInventory:
    IGNORED_PERMS = {"public", "admin_only"}
    
    # 权限白名单：只允许展示这些权限节点（Tab级别）
    WHITELIST_PERMISSIONS = {
        # 销售板块 - 4个tab
        "module.sales.transactions.upload",      # 交易数据上传
        "module.sales.reports.generate",         # 报表生成器
        "module.sales.reports.center",           # 报表中心
        "module.sales.visuals.dashboard",        # 数据交互可视化
        
        # 采购板块 - 9个tab
        "module.purchase.supplier.add",          # 新增供应商
        "module.purchase.supplier.strategy",     # 策略管理
        "module.purchase.po.add",                # 新建采购订单
        "module.purchase.po.mgmt",               # 订单管理
        "module.purchase.send.add",              # 新建发货单
        "module.purchase.send.mgmt",             # 发货单管理
        "module.purchase.receive",               # 货物入库
        "module.purchase.receive.mgmt",          # 入库管理
        "module.purchase.abnormal.manage",       # 入库异常处理
        
        # 财务板块 - 5个tab
        "module.finance.flow.view",              # 定发收总预览
        "module.finance.logistic.manage",        # 物流财务管理
        "module.finance.prepay.manage",          # 厂商预付款管理
        "module.finance.deposit.manage",         # 定金付款管理
        "module.finance.po.manage",              # 订单付款管理
        
        # 库存板块 - 4个tab
        "module.inventory.stocktake.upload",     # 手动上传盘存
        "module.inventory.stocktake.modify",     # 库存修改向导
        "module.inventory.dynamic.view",         # 动态库存管理
        "module.inventory.shelf.manage",         # 仓库货架码管理
        
        # 产品板块 - 3个tab
        "module.products.catalog.cogs",          # 产品数据维护
        "module.products.catalog.create",        # 新增产品
        "module.products.barcode.generate",      # 外包装条形码
        
        # 数据库运维 - 5个tab
        "module.db_admin.backup.create",         # 数据备份
        "module.db_admin.backup.restore",        # 数据恢复
        "module.db_admin.backup.manage",         # 备份管理
        "module.db_admin.cleanup.delete",        # 数据清洗
        # [REMOVED] rollback_restore deprecated 2026-02-04
        
        # 用户权限管理 - 2个submodule（无tabs）
        "module.user_admin.users",               # 用户列表
        "module.user_admin.register",            # 注册新用户
        
        # 安全审计日志 - 3个tab
        "module.audit.logs.business",            # 业务操作日志
        "module.audit.logs.infra",               # 全景数据审计
        "module.audit.logs.system",              # 系统故障监控
    }
    
    @staticmethod
    def _filter_tree_by_whitelist(tree: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """递归过滤权限树，只保留白名单中的Tab级节点"""
        filtered = []
        for node in tree:
            node_key = node.get("key")
            node_type = node.get("type")
            
            # Tab级节点：检查是否在白名单中
            if node_type == "tab":
                if node_key in SecurityInventory.WHITELIST_PERMISSIONS:
                    filtered.append(node)
            # Module/Submodule节点：递归过滤子节点
            elif "children" in node and node["children"]:
                filtered_children = SecurityInventory._filter_tree_by_whitelist(node["children"])
                if filtered_children:  # 只保留有子节点的父节点
                    node["children"] = filtered_children
                    filtered.append(node)
            # user_admin的submodule特殊处理（无tabs，直接是submodule）
            elif node_key in SecurityInventory.WHITELIST_PERMISSIONS:
                filtered.append(node)
        
        return filtered

    @staticmethod
    def get_full_permission_tree() -> List[Dict[str, Any]]:
        """
        构建完整的权限树 (支持三层结构)
        Module -> Submodule -> Tab -> Action
        """
        nav_modules = settings.load_modules_config()
        action_registry = settings.load_action_registry()

        # 构建动作映射 (支持新的 submodules 结构)
        registry_map = {}
        if "modules" in action_registry:
            for m in action_registry["modules"]:
                m_key = m.get("key")
                registry_map[m_key] = {}
                
                # 新结构: submodules -> tabs -> actions
                for sub in m.get("submodules", []):
                    sub_key = sub.get("key")
                    registry_map[m_key][sub_key] = {}
                    for t in sub.get("tabs", []):
                        t_key = t.get("key")
                        registry_map[m_key][sub_key][t_key] = t.get("actions", [])
                
                # 向后兼容: tabs -> actions
                for t in m.get("tabs", []):
                    t_key = t.get("key")
                    if "_legacy" not in registry_map[m_key]:
                        registry_map[m_key]["_legacy"] = {}
                    registry_map[m_key]["_legacy"][t_key] = t.get("actions", [])

        tree = []

        for mod in nav_modules:
            perm_key = mod.get("permission", "public")
            if perm_key in SecurityInventory.IGNORED_PERMS:
                continue

            mod_node = {
                "key": perm_key,
                "name": mod.get("name", "Unknown"),
                "type": "module",
                "children": []
            }

            raw_mod_key = mod.get("key")

            # 处理 submodules (新结构)
            for sub in mod.get("submodules", []):
                sub_perm_key = sub.get("permission")
                if not sub_perm_key or sub_perm_key in SecurityInventory.IGNORED_PERMS:
                    continue

                raw_sub_key = sub.get("key")
                sub_node = {
                    "key": sub_perm_key,
                    "name": sub.get("name", "Unknown"),
                    "type": "submodule",
                    "children": []
                }

                # 遍历 Tabs
                for tab in sub.get("tabs", []):
                    tab_perm_key = tab.get("permission")
                    if not tab_perm_key or tab_perm_key in SecurityInventory.IGNORED_PERMS:
                        continue

                    raw_tab_key = tab.get("key")
                    tab_node = {
                        "key": tab_perm_key,
                        "name": tab.get("name", "Unknown"),
                        "type": "tab",
                        "children": []
                    }

                    # 注入 Actions
                    if (raw_mod_key in registry_map and 
                        raw_sub_key in registry_map[raw_mod_key] and
                        raw_tab_key in registry_map[raw_mod_key][raw_sub_key]):
                        actions = registry_map[raw_mod_key][raw_sub_key][raw_tab_key]
                        for act in actions:
                            act_node = {
                                "key": act.get("key"),
                                "name": act.get("name"),
                                "type": "action",
                                "desc": act.get("description")
                            }
                            tab_node["children"].append(act_node)

                    sub_node["children"].append(tab_node)

                mod_node["children"].append(sub_node)

            # 向后兼容: 处理旧的 tabs 结构
            for tab in mod.get("tabs", []):
                tab_perm_key = tab.get("permission")
                if not tab_perm_key or tab_perm_key in SecurityInventory.IGNORED_PERMS:
                    continue

                raw_tab_key = tab.get("key")
                tab_node = {
                    "key": tab_perm_key,
                    "name": tab.get("name", "Unknown"),
                    "type": "tab",
                    "children": []
                }

                # 注入 Actions (旧结构)
                if (raw_mod_key in registry_map and 
                    "_legacy" in registry_map[raw_mod_key] and
                    raw_tab_key in registry_map[raw_mod_key]["_legacy"]):
                    actions = registry_map[raw_mod_key]["_legacy"][raw_tab_key]
                    for act in actions:
                        act_node = {
                            "key": act.get("key"),
                            "name": act.get("name"),
                            "type": "action",
                            "desc": act.get("description")
                        }
                        tab_node["children"].append(act_node)

                mod_node["children"].append(tab_node)

            tree.append(mod_node)

        # 应用白名单过滤
        tree = SecurityInventory._filter_tree_by_whitelist(tree)
        
        # 扁平化树结构：将submodule层的tab提升到module的直接children
        # 并移除action节点（权限树UI不展示action）
        flattened_tree = []
        for mod in tree:
            flat_mod = {
                "key": mod["key"],
                "name": mod["name"],
                "type": "module",
                "children": []
            }
            
            for child in mod.get("children", []):
                # 如果是submodule
                if child.get("type") == "submodule":
                    # 检查是否有tabs（如sales/purchase/inventory/products/db_admin）
                    if child.get("children"):
                        # 提取tabs并添加到module的children
                        for tab in child.get("children", []):
                            if tab.get("type") == "tab":
                                # 移除tab下的action children
                                tab_clean = {
                                    "key": tab["key"],
                                    "name": tab["name"],
                                    "type": "tab"
                                }
                                flat_mod["children"].append(tab_clean)
                    else:
                        # 没有tabs（如user_admin.users），直接作为tab级节点
                        flat_mod["children"].append({
                            "key": child["key"],
                            "name": child["name"],
                            "type": "tab"  # 统一类型为tab
                        })
                # 如果是直接的tab节点
                elif child.get("type") == "tab":
                    tab_clean = {
                        "key": child["key"],
                        "name": child["name"],
                        "type": "tab"
                    }
                    flat_mod["children"].append(tab_clean)

            
            flattened_tree.append(flat_mod)
        
        return flattened_tree

    @staticmethod
    def get_flat_action_list() -> List[Dict]:
        """获取扁平化的所有动作列表"""
        action_registry = settings.load_action_registry()
        flat_list = []
        if "modules" in action_registry:
            for m in action_registry["modules"]:
                # 新结构
                for sub in m.get("submodules", []):
                    for t in sub.get("tabs", []):
                        for a in t.get("actions", []):
                            a["module_name"] = m.get("name")
                            a["submodule_name"] = sub.get("name")
                            a["tab_name"] = t.get("name")
                            flat_list.append(a)
                # 旧结构
                for t in m.get("tabs", []):
                    for a in t.get("actions", []):
                        a["module_name"] = m.get("name")
                        a["tab_name"] = t.get("name")
                        flat_list.append(a)
        return flat_list
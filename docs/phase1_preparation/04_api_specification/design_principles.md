# API 设计原则

## 核心原则

### 1. RESTful 规范

| 方法 | 用途 | 示例 |
|------|------|------|
| GET | 获取资源 | `GET /api/products` |
| POST | 创建资源 | `POST /api/products` |
| PUT | 完整更新 | `PUT /api/products/:id` |
| PATCH | 部分更新 | `PATCH /api/products/:id` |
| DELETE | 删除资源 | `DELETE /api/products/:id` |

### 2. URL 命名规范

```
✅ 正确
/api/v1/products
/api/v1/products/:id
/api/v1/products/:id/inventory
/api/v1/purchase-orders
/api/v1/purchase-orders/:id/items

❌ 错误
/api/v1/getProducts
/api/v1/product_list
/api/v1/createPO
```

### 3. 版本控制

```
/api/v1/...   # 当前版本
/api/v2/...   # 未来版本

# Header 方式 (可选)
Accept: application/vnd.mgmt.v1+json
```

---

## 请求规范

### 分页
```json
GET /api/v1/products?page=1&pageSize=20

// 响应
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### 筛选
```
GET /api/v1/products?category=electronics&status=active
GET /api/v1/orders?dateFrom=2025-01-01&dateTo=2025-12-31
```

### 排序
```
GET /api/v1/products?sort=createdAt&order=desc
GET /api/v1/products?sort=-createdAt  # 简写形式
```

### 字段选择 (可选)
```
GET /api/v1/products?fields=id,sku,name,price
```

---

## 响应规范

### 成功响应

```json
// 单个资源
{
  "success": true,
  "data": {
    "id": 1,
    "sku": "ABC-001",
    "name": "Product A"
  }
}

// 列表
{
  "success": true,
  "data": [...],
  "pagination": {...}
}

// 创建成功
{
  "success": true,
  "data": {...},
  "message": "Product created successfully"
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "sku", "message": "SKU is required" },
      { "field": "price", "message": "Price must be positive" }
    ]
  }
}
```

---

## 错误码规范

### HTTP 状态码

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 200 | 成功 | GET/PUT/PATCH/DELETE 成功 |
| 201 | 已创建 | POST 创建成功 |
| 204 | 无内容 | DELETE 成功，无返回体 |
| 400 | 请求错误 | 参数校验失败 |
| 401 | 未认证 | 未登录/Token 失效 |
| 403 | 无权限 | 已登录但无权限 |
| 404 | 未找到 | 资源不存在 |
| 409 | 冲突 | 唯一约束冲突 |
| 422 | 不可处理 | 业务规则校验失败 |
| 500 | 服务器错误 | 未捕获异常 |

### 业务错误码

```typescript
enum ErrorCode {
  // 通用
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  
  // 认证
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  // 权限
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INSUFFICIENT_SECURITY_LEVEL = 'INSUFFICIENT_SECURITY_LEVEL',
  
  // 业务
  INSUFFICIENT_INVENTORY = 'INSUFFICIENT_INVENTORY',
  ORDER_ALREADY_PAID = 'ORDER_ALREADY_PAID',
  SUPPLIER_NOT_ACTIVE = 'SUPPLIER_NOT_ACTIVE',
}
```

---

## 认证规范

### JWT Token

```
Authorization: Bearer <token>
```

### Token 结构

```json
{
  "sub": "user-id",
  "username": "admin",
  "roles": ["admin"],
  "permissions": ["module.sales.*", "module.purchase.po.*"],
  "iat": 1699999999,
  "exp": 1700003599
}
```

### Token 刷新

```
POST /api/v1/auth/refresh
Body: { "refreshToken": "..." }
```

---

## 安全验证

### 高危操作验证

对于高危操作，需要额外的安全验证：

```json
POST /api/v1/database/restore
Headers:
  Authorization: Bearer <token>
  X-Security-Level: L4
  X-Security-Code: <encrypted_code>
  X-Action-Key: btn_restore_db
```

### 安全等级

| 等级 | 需要 | 操作类型 |
|------|------|----------|
| L1 | Token | 查询操作 |
| L2 | Token + 密码确认 | 修改操作 |
| L3 | Token + 安全码 | 数据库操作 |
| L4 | Token + 系统码 | 系统级操作 |

---

## DTO 规范

### 命名规范

```typescript
// 创建
CreateProductDto
CreatePurchaseOrderDto

// 更新
UpdateProductDto (Partial)
UpdatePurchaseOrderDto

// 查询
QueryProductDto
QueryPurchaseOrderDto

// 响应
ProductResponseDto
PurchaseOrderDetailDto
```

### 校验

```typescript
import { IsString, IsNumber, Min, IsOptional } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @Length(3, 50)
  sku: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0)
  cogs: number;
}
```

---

*Last Updated: 2026-02-04*

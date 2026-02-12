# 决策日志

## 决策记录模板

```
### 决策 ID: DEC-XXX
**日期**: YYYY-MM-DD
**主题**: 决策主题
**状态**: 待定 / 已决定 / 已执行

#### 背景
[为什么需要做这个决策]

#### 选项
1. 选项 A: [描述]
2. 选项 B: [描述]

#### 决定
[最终选择及原因]

#### 影响
[这个决策会影响什么]
```

---

## 决策记录

### DEC-001: 启动架构迁移项目
**日期**: 2026-02-04
**主题**: 是否从 Django 迁移到 TypeScript 全栈
**状态**: ✅ 已决定

#### 背景
当前系统基于 Django 单体架构，需要评估是否迁移到现代 TypeScript 全栈架构

#### 选项
1. **保持 Django**: 继续使用 Django，通过 Django Ninja 添加 API
2. **完全重写**: 使用 NestJS + Next.js + React Native 重写全部

#### 决定
选择**完全重写**方案，理由：
- 希望一次架构到位，避免未来再重构
- 需要 Mobile 支持
- TS 全栈类型共享的长期收益

#### 影响
- 需要 6+ 个月开发周期
- 老系统功能冻结
- 需要学习新技术栈

---

### DEC-002: 采用 Parallel Run 策略
**日期**: 2026-02-04
**主题**: 迁移策略选择
**状态**: ✅ 已决定

#### 背景
需要确定如何从老系统过渡到新系统

#### 选项
1. **逐步替换 (Strangler Fig)**: 一个模块一个模块替换
2. **并行运行 (Parallel Run)**: 新旧系统并行，完成后切换

#### 决定
选择**并行运行**方案，理由：
- 老系统保持完整可用
- 新系统可以独立开发和测试
- 切换时风险可控

#### 影响
- 需要维护两套系统（开发期间）
- 需要数据迁移脚本
- 需要灰度切换计划

---

### DEC-003: 技术栈确认
**日期**: 2026-02-04
**主题**: 新系统技术栈最终选型
**状态**: ⏳ 待确认 (Phase 2 验证后)

#### 背景
确定新系统使用的具体技术组件

#### 选项

**后端**:
- A: NestJS + Prisma
- B: Fastify + TypeORM

**前端**:
- A: Next.js (App Router)
- B: Vite + React

**移动端**:
- A: React Native + Expo
- B: Flutter

**数据库**:
- A: PostgreSQL
- B: 保持 MySQL

#### 决定
暂定方案：
- 后端: NestJS + Prisma
- Web: Next.js
- Mobile: React Native (待 Phase 2 验证)
- 数据库: PostgreSQL

#### 影响
- 待 Phase 2 验证后最终确认

---

### DEC-004: Monorepo 结构
**日期**: 2026-02-04
**主题**: 项目目录结构
**状态**: ✅ 已决定

#### 决定
采用 pnpm + Turborepo Monorepo 结构：
```
apps/api      - NestJS 后端
apps/web      - Next.js 前端
apps/mobile   - React Native
packages/shared - 共享类型
```

详见: `03_tech_stack/monorepo_structure.md`

---

### DEC-005: 老系统处理策略
**日期**: 2026-02-04
**主题**: 迁移期间老系统如何处理
**状态**: ✅ 已决定

#### 决定
1. **老系统冻结**: 只修 Bug，不加新功能
2. **复制到新目录**: `/MGMTV2/` 开发新系统
3. **老系统继续运行**: 直到新系统切换完成
4. **切换后保留回滚能力**: 2 周内可回滚

---

## 待定决策

| ID | 主题 | 预计决策日期 |
|----|------|-------------|
| DEC-006 | Mobile 技术栈 (RN vs Flutter) | Phase 2 结束 |
| DEC-007 | UI 组件库 (Ant Design vs shadcn) | Phase 2 中 |
| DEC-008 | 认证方式 (JWT vs Session) | Phase 2 中 |
| DEC-009 | 部署方式 (Docker/K8s) | Phase 3 中 |

---

*Last Updated: 2026-02-04*

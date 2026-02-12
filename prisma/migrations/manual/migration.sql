-- ============================================
-- VMA Temporal Tracking Migration
-- 时间维度追踪迁移脚本
-- 执行前请确保已备份数据库！
-- ============================================

-- Step 1: 添加 termination_date 列到 vma_employees
ALTER TABLE vma_employees ADD COLUMN IF NOT EXISTS termination_date TIMESTAMP;

-- Step 2: 创建显式员工-部门关联表 (ID 类型为 TEXT 匹配现有表)
CREATE TABLE IF NOT EXISTS vma_employee_departments (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  employee_id   TEXT NOT NULL REFERENCES vma_employees(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES vma_departments(id) ON DELETE RESTRICT,
  assigned_at   TIMESTAMP NOT NULL,
  removed_at    TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emp_dept_employee ON vma_employee_departments(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_dept_department ON vma_employee_departments(department_id);

-- Step 3: 从隐式 join 表迁移数据 (assignedAt = 员工的 hireDate)
INSERT INTO vma_employee_departments (employee_id, department_id, assigned_at)
SELECT jt."B", jt."A", e.hire_date
FROM "_VmaDepartmentToVmaEmployee" jt
JOIN vma_employees e ON e.id = jt."B"
ON CONFLICT DO NOTHING;

-- Step 4: 创建 SOP 需求变更历史表
CREATE TABLE IF NOT EXISTS vma_duty_sop_history (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  department_id TEXT NOT NULL REFERENCES vma_departments(id) ON DELETE CASCADE,
  change_date   TIMESTAMP NOT NULL,
  change_type   VARCHAR(10) NOT NULL,
  sop_no        VARCHAR(50) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sop_hist_dept ON vma_duty_sop_history(department_id);
CREATE INDEX IF NOT EXISTS idx_sop_hist_date ON vma_duty_sop_history(change_date);

-- Step 5: 为现有 SOP 需求创建 INITIAL 历史记录
INSERT INTO vma_duty_sop_history (department_id, change_date, change_type, sop_no)
SELECT duty_id, NOW(), 'INITIAL', sop_no
FROM vma_duty_sop_requirements
ON CONFLICT DO NOTHING;

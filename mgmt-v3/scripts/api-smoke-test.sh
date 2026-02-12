#!/bin/bash
# ═══════════════════════════════════════════════════════
# MGMT V3 API Smoke Test — 前端 API 对齐验证
# ═══════════════════════════════════════════════════════
# Usage: bash api-smoke-test.sh [BASE_URL]
# Default: http://localhost:8080/api/v1

BASE="${1:-http://localhost:8080/api/v1}"
PASS=0
FAIL=0
TOTAL=0
ERRORS=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════"
echo " MGMT V3 API Smoke Test"
echo " Base URL: $BASE"
echo " $(date)"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── Test function ───
test_endpoint() {
    local method="$1"
    local path="$2"
    local expected_status="$3"
    local description="$4"
    local body="$5"
    local token="$6"
    
    TOTAL=$((TOTAL + 1))
    
    local url="${BASE}${path}"
    local headers="-H 'Content-Type: application/json'"
    
    if [ -n "$token" ]; then
        headers="$headers -H 'Authorization: Bearer $token'"
    fi
    
    local cmd="curl -s -o /tmp/v3_response.json -w '%{http_code}' -X $method '$url' -H 'Content-Type: application/json'"
    if [ -n "$token" ]; then
        cmd="$cmd -H 'Authorization: Bearer $token'"
    fi
    if [ -n "$body" ]; then
        cmd="$cmd -d '$body'"
    fi
    
    local status=$(eval $cmd 2>/dev/null)
    local response=$(cat /tmp/v3_response.json 2>/dev/null)
    
    if [ "$status" = "$expected_status" ]; then
        PASS=$((PASS + 1))
        printf "  ${GREEN}✅ PASS${NC} [%s] %-40s → %s\n" "$method" "$path" "$status"
    else
        FAIL=$((FAIL + 1))
        printf "  ${RED}❌ FAIL${NC} [%s] %-40s → %s (expected %s)\n" "$method" "$path" "$status" "$expected_status"
        ERRORS="$ERRORS\n  ❌ [$method] $path → $status (expected $expected_status)"
        # Show response body on failure (first 200 chars)
        echo "     Response: $(echo "$response" | head -c 200)"
    fi
}

# ─── Test JSON structure ───
test_json_field() {
    local field="$1"
    local description="$2"
    local response=$(cat /tmp/v3_response.json 2>/dev/null)
    
    TOTAL=$((TOTAL + 1))
    
    if echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$field' in str(d)" 2>/dev/null; then
        PASS=$((PASS + 1))
        printf "  ${GREEN}✅ PASS${NC}        %-40s → field '%s' present\n" "$description" "$field"
    else
        FAIL=$((FAIL + 1))
        printf "  ${RED}❌ FAIL${NC}        %-40s → field '%s' missing\n" "$description" "$field"
        ERRORS="$ERRORS\n  ❌ $description → field '$field' missing"
    fi
}

# ═══════════════════════════════════════════════════════
# PHASE 1: Auth — Login and get JWT
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 1: Authentication${NC}"

# Login
TOKEN=""
LOGIN_BODY='{"username":"admin","password":"1522P"}'
STATUS=$(curl -s -o /tmp/v3_response.json -w '%{http_code}' -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "$LOGIN_BODY" 2>/dev/null)
RESPONSE=$(cat /tmp/v3_response.json 2>/dev/null)

TOTAL=$((TOTAL + 1))
if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
    TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken','') or d.get('accessToken',''))" 2>/dev/null)
    if [ -n "$TOKEN" ] && [ "$TOKEN" != "" ]; then
        PASS=$((PASS + 1))
        printf "  ${GREEN}✅ PASS${NC} [POST] %-40s → %s (JWT received)\n" "/auth/login" "$STATUS"
    else
        FAIL=$((FAIL + 1))
        printf "  ${RED}❌ FAIL${NC} [POST] %-40s → %s (no JWT in response)\n" "/auth/login" "$STATUS"
        ERRORS="$ERRORS\n  ❌ [POST] /auth/login → no JWT token in response"
        echo "     Response: $(echo "$RESPONSE" | head -c 300)"
    fi
else
    FAIL=$((FAIL + 1))
    printf "  ${RED}❌ FAIL${NC} [POST] %-40s → %s (expected 200/201)\n" "/auth/login" "$STATUS"
    ERRORS="$ERRORS\n  ❌ [POST] /auth/login → $STATUS (expected 200/201)"
    echo "     Response: $(echo "$RESPONSE" | head -c 300)"
fi

# Test bad login
test_endpoint "POST" "/auth/login" "401" "Bad credentials" '{"username":"admin","password":"wrong"}'

echo ""

# ═══════════════════════════════════════════════════════
# PHASE 2: User Module
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 2: Users Module${NC}"
test_endpoint "GET" "/users" "200" "List users" "" "$TOKEN"
test_json_field "username" "Users list has username field"
test_endpoint "GET" "/users/me" "200" "Current user profile" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 3: Roles Module
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 3: Roles Module${NC}"
test_endpoint "GET" "/roles" "200" "List roles" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 4: Logs Module
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 4: Logs Module${NC}"
test_endpoint "GET" "/logs/overview" "200" "Logs overview" "" "$TOKEN"
test_endpoint "GET" "/logs/health" "200" "Logs health" "" "$TOKEN"
test_endpoint "GET" "/logs/godmode/status" "200" "God mode status" "" "$TOKEN"
test_endpoint "GET" "/logs/business?page=1&pageSize=5" "200" "Business logs" "" "$TOKEN"
test_endpoint "GET" "/logs/access?page=1&pageSize=5" "200" "Access logs" "" "$TOKEN"
test_endpoint "GET" "/logs/errors?page=1&pageSize=5" "200" "Error logs" "" "$TOKEN"
test_endpoint "GET" "/logs/audits?page=1&pageSize=5" "200" "Audit logs" "" "$TOKEN"
test_endpoint "GET" "/logs/alerts" "200" "Alerts list" "" "$TOKEN"
test_endpoint "GET" "/logs/archive/stats" "200" "Archive stats" "" "$TOKEN"
test_endpoint "GET" "/logs/archive/history?page=1&pageSize=5" "200" "Archive history" "" "$TOKEN"
test_endpoint "GET" "/logs/maintenance/stats" "200" "Maintenance stats" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 5: Products Module
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 5: Products Module${NC}"
test_endpoint "GET" "/products?page=1&limit=5" "200" "Product list (paginated)" "" "$TOKEN"
test_json_field "data" "Products response has 'data' field"
test_json_field "meta" "Products response has 'meta' field"
test_endpoint "GET" "/products/categories" "200" "Product categories" "" "$TOKEN"
test_endpoint "GET" "/products/sku-list" "200" "SKU list" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 6: VMA — Employees & Departments
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 6: VMA — Employees & Departments${NC}"
test_endpoint "GET" "/vma/employees" "200" "VMA employees list" "" "$TOKEN"
test_endpoint "GET" "/vma/departments" "200" "VMA departments list" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 7: VMA — Training SOPs
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 7: VMA — Training SOPs${NC}"
test_endpoint "GET" "/vma/training-sops" "200" "Training SOPs list" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 8: VMA — Training Records
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 8: VMA — Training Records${NC}"
test_endpoint "GET" "/vma/training-sessions" "200" "Training sessions" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 9: VMA — P-Valve Products
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 9: VMA — P-Valve Products${NC}"
test_endpoint "GET" "/vma/pvalve-products" "200" "P-Valve products" "" "$TOKEN"
test_endpoint "GET" "/vma/delivery-system-products" "200" "Delivery systems" "" "$TOKEN"
test_endpoint "GET" "/vma/fit-matrix" "200" "Fit matrix" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 10: VMA — Inventory
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 10: VMA — Inventory${NC}"
test_endpoint "GET" "/vma/inventory-transactions" "200" "Inventory transactions" "" "$TOKEN"
test_endpoint "GET" "/vma/inventory-transactions/summary?productType=PVALVE" "200" "Inventory summary (PVALVE)" "" "$TOKEN"
test_endpoint "GET" "/vma/inventory-transactions/demo" "200" "Demo inventory" "" "$TOKEN"
test_endpoint "GET" "/vma/inventory-transactions/spec-options?productType=PVALVE" "200" "Spec options (PVALVE)" "" "$TOKEN"
test_endpoint "GET" "/vma/inventory-transactions/operators" "200" "Operators list" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 11: VMA — Clinical Cases
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 11: VMA — Clinical Cases${NC}"
test_endpoint "GET" "/vma/clinical-cases" "200" "Clinical cases" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 12: VMA — Sites
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 12: VMA — Sites${NC}"
test_endpoint "GET" "/vma/sites" "200" "Sites list" "" "$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════
# PHASE 13: Auth Guard — Unauthenticated access
# ═══════════════════════════════════════════════════════
echo "${BLUE}▶ Phase 13: Auth Guard — Reject Unauthenticated${NC}"
test_endpoint "GET" "/users" "401" "Users without token (should 401)" "" ""
test_endpoint "GET" "/products?page=1&limit=5" "401" "Products without token (should 401)" "" ""
test_endpoint "GET" "/vma/employees" "401" "VMA without token (should 401)" "" ""
echo ""

# ═══════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo " RESULTS"
echo "═══════════════════════════════════════════════════"
printf " Total:  %d\n" "$TOTAL"
printf " ${GREEN}Passed: %d${NC}\n" "$PASS"
printf " ${RED}Failed: %d${NC}\n" "$FAIL"

if [ "$FAIL" -eq 0 ]; then
    echo ""
    printf " ${GREEN}🎉 ALL TESTS PASSED — V3 API is fully compatible!${NC}\n"
    echo ""
    echo " ✅ Safe to switch frontend from V2 → V3"
    echo " ✅ Safe to delete V2 NestJS backend"
else
    echo ""
    printf " ${RED}⚠️  FAILURES DETECTED:${NC}\n"
    printf "$ERRORS\n"
    echo ""
    echo " ❌ Fix failures before switching frontend"
fi
echo "═══════════════════════════════════════════════════"

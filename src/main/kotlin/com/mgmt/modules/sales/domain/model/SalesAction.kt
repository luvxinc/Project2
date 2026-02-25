package com.mgmt.modules.sales.domain.model

/**
 * SalesAction — PostgreSQL sales_action 枚举。
 *
 *   NN = Normal (type='order', 默认)
 *   CA = Cancel (type='refund', reference_id 含 'cancel')
 *   RE = Return (type='refund', reference_id 含 'return')
 *   CR = Credit  (type='claim', reference_id 含 'request')
 *   CC = Chargeback/Case (type='claim', reference_id 含 'case')
 *   PD = Payment Dispute (type='payment dispute')
 */
enum class SalesAction {
    NN, CA, RE, CR, CC, PD
}

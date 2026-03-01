-- V42: Remove by_quantity from decision tree (it's a dimension inside leaf nodes, not a tree branch)
DELETE FROM offer_reply_tree WHERE decision_key = 'by_quantity';

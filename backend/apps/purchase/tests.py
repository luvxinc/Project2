from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth import get_user_model
from core.services.auth.service import AuthService
from core.services.security.policy_manager import SecurityPolicyManager
from .models import Supplier, SupplierStrategy
from .forms import SupplierForm, SupplierStrategyForm

class SupplierModelTest(TestCase):
    def test_create_supplier(self):
        supplier = Supplier.objects.create(
            supplier_code="AA",
            supplier_name="Test Supplier"
        )
        self.assertEqual(supplier.supplier_code, "AA")
        # Strategy is separate now

    def test_supplier_code_uniqueness(self):
        Supplier.objects.create(supplier_code="BB", supplier_name="B Supp")
        with self.assertRaises(Exception):
            Supplier.objects.create(supplier_code="BB", supplier_name="Another B")

class SupplierFormTest(TestCase):
    def test_valid_identity_form(self):
        data = {'supplier_code': 'CC', 'supplier_name': 'C Supp'}
        form = SupplierForm(data=data)
        self.assertTrue(form.is_valid())

    def test_valid_strategy_form(self):
        data = {
            'category': 'E',
            'currency': 'RMB',
            'float_currency': False,
            'float_threshold': 0.0,
            'depository': False,
            'deposit_par': 0.0
        }
        form = SupplierStrategyForm(data=data)
        self.assertTrue(form.is_valid())

    def test_invalid_code_format(self):
        data = {'supplier_code': '12', 'supplier_name': 'Bad Code'}
        form = SupplierForm(data=data)
        self.assertFalse(form.is_valid())
        self.assertIn('supplier_code', form.errors)

class SupplierViewTest(TestCase):
    def setUp(self):
        # Create test user
        self.password = "password123"
        self.user = get_user_model().objects.create_user(
            username="testadmin", 
            password=self.password,
            is_staff=True,
            is_superuser=True 
        )
        AuthService.initialize()
        SecurityPolicyManager.reset_cache() 
        AuthService.create_user("testadmin", self.password, is_admin=True)

        self.client = Client()
        self.client.force_login(self.user)
        self.url = reverse('web_ui:purchase:add_supplier') 

    def test_add_supplier_full_flow(self):
        data = {
            'supplier_code': 'EE',
            'supplier_name': 'Full Flow Supplier',
            'category': 'E',
            'currency': 'USD',
            'float_currency': False,
            'float_threshold': 0.0,
            'depository': False,
            'deposit_par': 0.0,
            'sec_code_l0': self.password
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, 200)
        
        # Verify DB
        self.assertTrue(Supplier.objects.filter(supplier_code='EE').exists())
        self.assertTrue(SupplierStrategy.objects.filter(supplier__supplier_code='EE').exists())
        
        strategy = SupplierStrategy.objects.get(supplier__supplier_code='EE')
        self.assertEqual(strategy.note, "默认策略")
        self.assertIsNotNone(strategy.effective_date)

    def test_float_and_depository_logic(self):
        """Test the logic with new schema"""
        # Case 1: Float OFF, val 0 (Default) -> Valid
        data = {
            'supplier_code': 'FF', 'supplier_name': 'F1 Supp',
            'category': 'E', 'currency': 'RMB',
            'float_currency': False, 'float_threshold': 0.0,
            'depository': False, 'deposit_par': 0.0,
            'sec_code_l0': self.password
        }
        resp = self.client.post(self.url, data)
        self.assertEqual(resp.status_code, 200)

        # Case 2: Float ON, val 0 -> Invalid
        data['supplier_code'] = 'FG'
        data['float_currency'] = True
        data['float_threshold'] = 0.0
        resp = self.client.post(self.url, data)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("必须设置有效的浮动阈值", resp.json()['message'])

        # Case 6: Float Threshold > 10 -> Invalid
        data['float_threshold'] = 15.0
        resp = self.client.post(self.url, data)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("价格浮动阈值不能超过 10%", resp.json()['message'])

from .settings import *
import os

# Override Database to use SQLite for CI/Test environments without MySQL
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Disable some middlewares or apps if they cause issues (Optional)

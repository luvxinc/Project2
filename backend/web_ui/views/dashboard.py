from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from backend.common.settings import settings as app_settings
from backend.common.patch_parser import parse_patch_notes, get_latest_release_info
import os

@login_required(login_url='web_ui:login')
def dashboard_home(request):
    role_display = "User"
    if request.user.is_superuser: role_display = "Super Administrator"
    elif request.user.is_staff: role_display = "Administrator"
    
    # Parse Patch Notes
    # Moved from __pycache__ to backend root for better organization
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    patch_file = os.path.join(base_dir, "patch_notes.txt")
    
    notes, version = parse_patch_notes(patch_file)
    release_date = get_latest_release_info(notes, version)
    
    return render(request, "pages/dashboard_home.html", {
        "version": version, # Use version from file
        "role": role_display,
        "patch_notes": notes,
        "release_date": release_date
    })
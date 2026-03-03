from __future__ import annotations

from flask import Flask

from .login import bp as auth_bp
from .PMS_Business_Year import bp as business_year_bp
from .PMS_Expenses import bp as expenses_bp
from .PMS_addProject import bp as project_form_bp
from .PMS_Business_Detail import bp as business_detail_bp
from .PMS_Business_examine import bp as business_examine_bp
from .common_api import bp as common_api_bp
from .project_files import bp as project_files_bp
from .outsourcing import bp as outsourcing_bp
from .PMS_dataTransfer import bp as data_transfer_bp
from .admin_api import bp as admin_api_bp
from .PMS_annualProject import bp as annual_project_bp
from .weekly_detail import bp as weekly_detail_bp
from .doc_editor_api import bp as doc_editor_api_bp


def register_blueprints(app: Flask) -> None:
    app.register_blueprint(auth_bp)
    app.register_blueprint(business_year_bp)
    app.register_blueprint(expenses_bp)
    app.register_blueprint(project_form_bp)
    app.register_blueprint(business_detail_bp)
    app.register_blueprint(business_examine_bp)
    app.register_blueprint(common_api_bp)
    app.register_blueprint(project_files_bp)
    app.register_blueprint(outsourcing_bp)
    app.register_blueprint(data_transfer_bp)
    app.register_blueprint(admin_api_bp)
    app.register_blueprint(annual_project_bp)
    app.register_blueprint(weekly_detail_bp)
    app.register_blueprint(doc_editor_api_bp)


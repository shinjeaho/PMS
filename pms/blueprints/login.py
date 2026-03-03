from __future__ import annotations

import hashlib
from datetime import datetime

from flask import Blueprint, request, render_template, redirect, url_for, flash, jsonify, session

from ..db import create_connection

bp = Blueprint('auth', __name__)


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


@bp.route('/')
def index():
    if 'user' in session:
        current_year = datetime.now().year
        return redirect(url_for('business_year.business', year=current_year))
    return redirect(url_for('auth.login'))


@bp.route('/login', methods=['GET', 'POST'])
def login():
    current_year = datetime.now().year

    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        hashed_password = hash_password(password)

        conn = create_connection()
        cursor = conn.cursor(dictionary=True)

        sql = """
            SELECT *,
                   COALESCE(dataauth, 0)   AS dataauth,
                   COALESCE(reportAUTH, 0) AS reportAUTH,
                   COALESCE(projectAUTH, 0) AS projectAUTH
            FROM users
            WHERE userID = %s AND Password = %s
        """
        cursor.execute(sql, (username, hashed_password))
        user = cursor.fetchone()
        cursor.close()
        conn.close()

        if user:
            session['user'] = {
                'userID': user['userID'],
                'name': user['Name'],
                'department': user['Department'],
                'auth': user['Auth'],
                'dataauth': int(user.get('dataauth', 0) or 0),
                'reportAUTH': int(user.get('reportAUTH', 0) or 0),
                'projectAUTH': int(user.get('projectAUTH', 0) or 0)
            }

            print("[LOGIN SUCCESS] DB 조회 결과:", user)
            print("[LOGIN SUCCESS] 세션 저장 값:", session['user'])
            return redirect(url_for('business_year.business', year=current_year))

        flash('아이디 또는 비밀번호가 틀렸습니다.')
        return redirect(url_for('auth.login'))

    return render_template('login.html')


@bp.route('/change_password', methods=['POST'])
def change_password():
    username = request.form['username']
    use_password = request.form['use_password']
    new_password = request.form['new_password']

    hashed_current_pw = hash_password(use_password)
    hashed_new_pw = hash_password(new_password)

    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    sql = "SELECT *, COALESCE(dataauth,0) AS dataauth FROM users WHERE userID = %s AND Password = %s"
    cursor.execute(sql, (username, hashed_current_pw))
    user = cursor.fetchone()

    if user:
        update_sql = "UPDATE users SET Password = %s, updateDate = NOW() WHERE userID = %s"
        cursor.execute(update_sql, (hashed_new_pw, username))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify(success=True)

    cursor.close()
    conn.close()
    return jsonify(success=False, message="아이디 또는 기존 비밀번호가 일치하지 않습니다.")


@bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"success": True, "message": "로그아웃 완료"})

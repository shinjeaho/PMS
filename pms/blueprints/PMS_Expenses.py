from __future__ import annotations

from flask import Blueprint, request, render_template, jsonify

from ..db import create_connection

bp = Blueprint('expenses', __name__)


@bp.route('/api/expenses/years')
def get_expense_years():
    db = create_connection()
    cursor = db.cursor()
    try:
        cursor.execute("SELECT DISTINCT Year FROM EXPENSES ORDER BY Year DESC")
        years = [year[0] for year in cursor.fetchall()]
        return jsonify(years)
    finally:
        cursor.close()
        db.close()


@bp.route('/PMS_Expenses/<int:year>')
def pms_expenses(year: int):
    """기준정보(인건비 기준표) 조회.
    - ?format=json 이면 JSON 배열 반환
    - 그 외에는 템플릿 렌더(필요 시)
    """
    wants_json = request.args.get('format') == 'json'
    db = create_connection()
    if db is None:
        if wants_json:
            return jsonify([]), 200
        return render_template('PMS_Expenses.html', year=year, expenses=[], company_expenses=None)

    cursor = db.cursor()
    try:
        cursor.execute(
            """
            SELECT Position, MonthlyAverageSalary, Hours, Days
            FROM EXPENSES
            WHERE Year = %s
            ORDER BY CASE Position
                WHEN '이사' THEN 1
                WHEN '부장' THEN 2
                WHEN '차장' THEN 3
                WHEN '과장' THEN 4
                WHEN '대리' THEN 5
                WHEN '주임' THEN 6
                WHEN '사원' THEN 7
                WHEN '계약직' THEN 8
                ELSE 99 END
            """,
            (year,),
        )
        rows = cursor.fetchall()
        if wants_json:
            data = [
                {
                    'Position': r[0],
                    'MonthlyAverageSalary': (float(r[1]) if r[1] is not None else None),
                    'Hours': (float(r[2]) if r[2] is not None else None),
                    'Days': (float(r[3]) if r[3] is not None else None),
                }
                for r in rows
            ]
            return jsonify(data)

        return render_template('PMS_Expenses.html', year=year, expenses=rows, company_expenses=None)
    finally:
        cursor.close()
        db.close()


@bp.route('/api/expenses/save', methods=['POST'])
def save_expenses():
    try:
        data = request.json
        year = data['year']
        expense_data = data['data']

        db = create_connection()
        cursor = db.cursor()

        try:
            cursor.execute("SELECT COUNT(*) FROM EXPENSES WHERE Year = %s", (year,))
            exists = cursor.fetchone()[0] > 0

            for row in expense_data:
                if exists:
                    cursor.execute(
                        """
                        UPDATE EXPENSES 
                        SET MonthlyAverageSalary = %s, Hours = %s, Days = %s
                        WHERE Year = %s AND Position = %s
                        """,
                        (row['MonthlyAverageSalary'], row['Hours'], row['Days'], year, row['Position']),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO EXPENSES (Year, Position, MonthlyAverageSalary, Hours, Days)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (year, row['Position'], row['MonthlyAverageSalary'], row['Hours'], row['Days']),
                    )

            db.commit()
            return jsonify({'success': True})

        finally:
            cursor.close()
            db.close()

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/prices/<int:year>')
def get_prices(year: int):
    db = create_connection()
    cursor = db.cursor()
    try:
        cursor.execute(
            '''
            SELECT ITEM, price 
            FROM RecordsPrice 
            WHERE YEAR = %s
            ORDER BY CASE 
                WHEN ITEM = '복리후생비/식대' THEN 1
                WHEN ITEM = '복리후생비/음료 외' THEN 2
                WHEN ITEM = '여비교통비/(출장)숙박' THEN 3
                WHEN ITEM = '여비교통비/주차료' THEN 4
                WHEN ITEM = '여비교통비/대중교통' THEN 5
                WHEN ITEM = '소모품비/현장물품' THEN 6
                WHEN ITEM = '소모품비/기타소모품' THEN 7
                WHEN ITEM = '차량유지비/주유' THEN 8
                WHEN ITEM = '차량유지비/차량수리 외' THEN 9
                WHEN ITEM = '도서인쇄비/출력 및 제본' THEN 10
                WHEN ITEM = '운반비/등기우편 외' THEN 11
                WHEN ITEM = '지급수수료/증명서발급' THEN 12
                WHEN ITEM = '기타/그 외 기타' THEN 99
                ELSE 14
            END
            ''',
            (year,),
        )
        prices = [{'item': row[0], 'price': row[1]} for row in cursor.fetchall()]
        return jsonify(prices)
    finally:
        cursor.close()
        db.close()


@bp.route('/api/prices/save', methods=['POST'])
def save_prices():
    try:
        data = request.json
        year = data['year']
        price_data = data['data']

        db = create_connection()
        cursor = db.cursor()

        try:
            cursor.execute("SELECT COUNT(*) FROM RecordsPrice WHERE YEAR = %s", (year,))
            exists = cursor.fetchone()[0] > 0

            for row in price_data:
                if exists:
                    cursor.execute(
                        """
                        UPDATE RecordsPrice 
                        SET price = %s
                        WHERE YEAR = %s AND ITEM = %s
                        """,
                        (row['price'], year, row['item']),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO RecordsPrice (YEAR, ITEM, price)
                        VALUES (%s, %s, %s)
                        """,
                        (year, row['item'], row['price']),
                    )

            db.commit()
            return jsonify({'success': True})

        finally:
            cursor.close()
            db.close()

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

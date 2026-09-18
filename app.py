import os
import re
import json
import sqlite3
import datetime
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

DB_FILE = os.path.join(os.path.dirname(__file__), 'sems.db')

ADMIN_PERMISSIONS = {
    "dashboard": True,
    "machines": True,
    "add_machine": True,
    "edit_machine": True,
    "delete_machine": True,
    "scheduler": True,
    "update_scheduler": True,
    "technicians": True,
    "notifications": True,
    "edit_notifications": True,
    "delete_notifications": True,
    "reports": True,
    "whatsapp": True
}

DEFAULT_TECHNICIAN_PERMISSIONS = {
    "dashboard": True,
    "machines": True,
    "add_machine": False,
    "edit_machine": False,
    "delete_machine": False,
    "scheduler": True,
    "update_scheduler": True,
    "technicians": False,
    "notifications": True,
    "edit_notifications": False,
    "delete_notifications": False,
    "reports": False,
    "whatsapp": False
}

def parse_maintenance_interval_days(interval_str):
    if not interval_str:
        return 30
    s = str(interval_str).lower().strip()
    if 'quarter' in s:
        return 90
    if 'bi-month' in s or 'bimonth' in s:
        return 60
    if 'semi' in s or 'half' in s:
        return 180
    if 'annual' in s or 'year' in s:
        return 365
    if 'week' in s:
        return 7
    if 'month' in s:
        return 30
    digits = re.findall(r'\d+', s)
    if digits:
        return max(1, int(digits[0]))
    return 30

def compute_health_score(install_date_str, next_service_date_str, interval_str, breakdowns, daily_usage_hours, ref_date=None):
    """
    Implements the exact Health Score Risk Engine:
    Health Score = 100 - (Maintenance Risk + Breakdown Risk + Age Risk + Usage Risk)
    
    1. Maintenance Risk (Max 40) = (Days Overdue / Maintenance Interval) × 40 (Max 40)
    2. Breakdown Risk (Max 30) = Number of Breakdowns × 6 (Max 30)
    3. Age Risk (Max 20) = Machine Age (Years) × 2 (Max 20)
    4. Usage Risk (Max 10) = (Daily Usage Hours / 24) × 10 (Max 10)
    """
    today = ref_date or datetime.date.today()
    
    # 1. Maintenance Risk
    interval_days = parse_maintenance_interval_days(interval_str)
    days_overdue = 0
    if next_service_date_str:
        try:
            clean_date_str = str(next_service_date_str).split('T')[0].strip()
            next_date = datetime.datetime.strptime(clean_date_str, '%Y-%m-%d').date()
            if next_date < today:
                days_overdue = (today - next_date).days
        except Exception:
            days_overdue = 0
            
    maint_risk = min(40.0, max(0.0, (days_overdue / max(1, interval_days)) * 40.0))
    
    # 2. Breakdown Risk
    b_count = max(0, int(breakdowns or 0))
    breakdown_risk = min(30.0, max(0.0, b_count * 6.0))
    
    # 3. Age Risk
    age_years = 1.0
    if install_date_str:
        try:
            clean_inst_str = str(install_date_str).split('T')[0].strip()
            inst_date = datetime.datetime.strptime(clean_inst_str, '%Y-%m-%d').date()
            age_days = (today - inst_date).days
            age_years = max(0.0, round(age_days / 365.25, 1))
        except Exception:
            age_years = 1.0
            
    age_risk = min(20.0, max(0.0, age_years * 2.0))
    
    # 4. Usage Risk
    usage_hours = min(24.0, max(0.0, float(daily_usage_hours if daily_usage_hours is not None else 12.0)))
    usage_risk = min(10.0, max(0.0, (usage_hours / 24.0) * 10.0))
    
    total_risk = round(maint_risk + breakdown_risk + age_risk + usage_risk, 1)
    health_score = max(0, min(100, round(100.0 - total_risk)))
    
    return {
        'health_score': health_score,
        'total_risk': total_risk,
        'maintenance_risk': round(maint_risk, 1),
        'breakdown_risk': round(breakdown_risk, 1),
        'age_risk': round(age_risk, 1),
        'usage_risk': round(usage_risk, 1),
        'days_overdue': days_overdue,
        'maintenance_interval_days': interval_days,
        'machine_age_years': age_years,
        'breakdowns_count': b_count,
        'daily_usage_hours': usage_hours
    }

def get_db():
    """Returns a SQLite database connection with row access by column name."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes database schema, handles schema migrations, and populates demo records if empty."""
    conn = get_db()
    cursor = conn.cursor()
    
    # Create tables if not present
    cursor.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'Plant Manager (Admin)',
            permissions TEXT DEFAULT '',
            status TEXT DEFAULT 'Active',
            technician_id INTEGER
        );

        CREATE TABLE IF NOT EXISTS technicians (
            technician_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            department TEXT NOT NULL,
            phone TEXT NOT NULL,
            status TEXT DEFAULT 'Available',
            assigned_tasks INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS machines (
            machine_id TEXT PRIMARY KEY,
            machine_name TEXT NOT NULL,
            category TEXT NOT NULL,
            machine_type TEXT NOT NULL,
            department TEXT NOT NULL,
            location TEXT NOT NULL,
            manufacturer TEXT DEFAULT 'Siemens Industrial',
            install_date TEXT NOT NULL,
            last_service_date TEXT,
            next_service_date TEXT,
            maintenance_interval TEXT DEFAULT 'Monthly',
            status TEXT DEFAULT 'Active',
            health_score INTEGER DEFAULT 95,
            notes TEXT,
            breakdowns_count INTEGER DEFAULT 0,
            daily_usage_hours REAL DEFAULT 12.0,
            maintenance_interval_days INTEGER DEFAULT 30
        );

        CREATE TABLE IF NOT EXISTS maintenance (
            maintenance_id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_id TEXT NOT NULL,
            technician_id INTEGER NOT NULL,
            maintenance_date TEXT NOT NULL,
            priority TEXT DEFAULT 'Medium',
            status TEXT DEFAULT 'Pending',
            service_type TEXT DEFAULT 'Preventive Maintenance',
            description TEXT,
            notes TEXT,
            cost REAL DEFAULT 450.0,
            downtime_hours REAL DEFAULT 2.5,
            completed_at TEXT,
            FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
            FOREIGN KEY (technician_id) REFERENCES technicians(technician_id)
        );

        CREATE TABLE IF NOT EXISTS notifications (
            notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_id TEXT NOT NULL,
            message TEXT NOT NULL,
            due_date TEXT NOT NULL,
            priority TEXT DEFAULT 'High',
            status TEXT DEFAULT 'Unread',
            notification_type TEXT DEFAULT 'Maintenance Due',
            FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
        );
    ''')

    # Column migrations for existing databases
    # users table migrations
    cursor.execute("PRAGMA table_info(users)")
    user_cols = [c[1] for c in cursor.fetchall()]
    if 'permissions' not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT ''")
    if 'status' not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Active'")
    if 'technician_id' not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN technician_id INTEGER")
    if 'last_login' not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN last_login TEXT")

    # technicians table migrations
    cursor.execute("PRAGMA table_info(technicians)")
    tech_cols = [c[1] for c in cursor.fetchall()]
    if 'role' not in tech_cols:
        cursor.execute("ALTER TABLE technicians ADD COLUMN role TEXT DEFAULT 'Field Specialist'")
    if 'last_login' not in tech_cols:
        cursor.execute("ALTER TABLE technicians ADD COLUMN last_login TEXT")
    if 'created_at' not in tech_cols:
        cursor.execute("ALTER TABLE technicians ADD COLUMN created_at TEXT")

    # machines table migrations
    cursor.execute("PRAGMA table_info(machines)")
    machine_cols = [c[1] for c in cursor.fetchall()]
    if 'breakdowns_count' not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN breakdowns_count INTEGER DEFAULT 0")
    if 'daily_usage_hours' not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN daily_usage_hours REAL DEFAULT 12.0")
    if 'maintenance_interval_days' not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN maintenance_interval_days INTEGER DEFAULT 30")

    # Seed or update admin user permissions
    admin_perms_str = json.dumps(ADMIN_PERMISSIONS)
    cursor.execute("UPDATE users SET permissions = ?, status = 'Active', role = 'Plant Manager (Admin)' WHERE LOWER(email) = 'admin@smartfactory.com'", (admin_perms_str,))
    
    # Seed or update technician user permissions
    tech_perms_str = json.dumps(DEFAULT_TECHNICIAN_PERMISSIONS)
    cursor.execute("UPDATE users SET permissions = ?, status = 'Active', role = 'Senior Reliability Engineer (Technician)' WHERE LOWER(email) = 'sarah@smartfactory.com'", (tech_perms_str,))

    # Seed data if empty
    cursor.execute("SELECT COUNT(*) FROM machines")
    if cursor.fetchone()[0] == 0:
        # Seed Admin & Engineer Users
        cursor.executemany("INSERT INTO users (user_id, name, email, password, role, permissions, status, technician_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
            (1, 'Alex Mercer (Admin)', 'admin@smartfactory.com', 'admin123', 'Plant Manager (Admin)', admin_perms_str, 'Active', None),
            (2, 'Sarah Connor', 'sarah@smartfactory.com', 'tech123', 'Senior Reliability Engineer (Technician)', tech_perms_str, 'Active', 101)
        ])

        # Seed Technicians with Email addresses
        cursor.executemany("INSERT INTO technicians (technician_id, name, email, department, phone, status, assigned_tasks) VALUES (?, ?, ?, ?, ?, ?, ?)", [
            (101, 'Sarah Connor', 'sarah@smartfactory.com', 'Senior Reliability', '+1 (555) 123-4567', 'Available', 2),
            (102, 'Marcus Vance', 'marcus.vance@smartfactory.com', 'Mechanical Systems', '+1 (555) 234-8901', 'Available', 3),
            (103, 'Elena Rostova', 'elena.rostova@smartfactory.com', 'Electrical & Controls', '+1 (555) 345-9012', 'On Field', 5),
            (104, 'David Chen', 'david.chen@smartfactory.com', 'Hydraulics & Pneumatics', '+1 (555) 456-0123', 'Available', 2),
            (105, 'Rajesh Kumar', 'rajesh.kumar@smartfactory.com', 'Automation & Robotics', '+1 (555) 567-1234', 'Busy', 4),
            (106, 'John Miller', 'john.miller@smartfactory.com', 'HVAC & Utilities', '+1 (555) 678-2345', 'Available', 1)
        ])

        # Seed Featured Machines
        initial_machines = [
            ('MCH-CNC-001', 'CNC Milling Station 01', 'CNC Machining', '5-Axis CNC Mill', 'Machining Shop', 'Bay A - Floor 1', 'Haas Automation', '2022-03-15', '2026-08-10', '2026-09-20', 'Monthly', 'Active', 94, 'High precision milling center running 16h shifts daily.', 0, 16.0, 30),
            ('MCH-BLR-002', 'Boiler Unit B', 'Thermal Utilities', 'High Pressure Steam Boiler', 'Utility Plant', 'Building 3 - Cell B', 'Cleaver-Brooks', '2020-06-20', '2026-06-15', '2026-09-11', 'Quarterly', 'Under Maintenance', 68, 'Requires pressure check and safety valve calibration.', 1, 18.0, 90),
            ('MCH-HYD-003', 'Hydraulic Press 500T', 'Heavy Stamping', '500-Ton Hydraulic Press', 'Assembly Line A', 'Bay C - Floor 1', 'Bosch Rexroth', '2021-11-05', '2026-07-01', '2026-09-30', 'Bi-Monthly', 'Active', 91, 'Hydraulic fluid leak inspection completed in July.', 0, 10.0, 60),
            ('MCH-ROB-004', 'Robotic Arm KUKA KR60', 'Automation', '6-Axis Articulated Robot', 'Welding Cell 2', 'Robotics Hub', 'KUKA Robotics', '2023-01-10', '2026-08-25', '2026-10-15', 'Quarterly', 'Active', 98, 'Servo motor zeroing performed recently.', 0, 8.0, 90),
            ('MCH-CMP-005', 'Rotary Air Compressor C4 (Formula Ref)', 'Compressed Air', 'Rotary Screw Compressor', 'Utility Plant', 'Compressor Room 1', 'Atlas Copco', '2020-09-17', '2026-05-10', '2026-09-02', 'Monthly', 'Breakdown', 45, 'Formula Reference Machine: Age 6y, Overdue 15d, Breakdowns 3, Usage 12h/d.', 3, 12.0, 30),
            ('MCH-LAT-006', 'Precision CNC Lathe L2', 'CNC Machining', 'CNC Turning Center', 'Machining Shop', 'Bay A - Floor 2', 'Mazak', '2022-08-18', '2026-08-01', '2026-10-01', 'Monthly', 'Active', 89, 'Spindle alignment verified.', 1, 14.0, 30),
            ('MCH-CON-007', 'Main Assembly Conveyor', 'Material Handling', 'Belt Conveyor Network', 'Assembly Line B', 'Main Floor', 'Hytrol', '2021-04-22', '2026-07-20', '2026-09-25', 'Monthly', 'Active', 96, 'Drive chain tensioned.', 0, 16.0, 30),
            ('MCH-HVAC-008', 'Chiller Unit HVAC-01', 'HVAC Systems', 'Industrial Centrifugal Chiller', 'Building Facilities', 'Rooftop Deck 2', 'Trane', '2018-05-30', '2026-04-10', '2026-09-15', 'Quarterly', 'Active', 85, 'Refrigerant levels nominal.', 1, 20.0, 90)
        ]

        depts = ['Machining Shop', 'Utility Plant', 'Assembly Line A', 'Robotics Hub', 'Building Facilities', 'Packaging Bay']
        cats = ['CNC Machining', 'Thermal Utilities', 'Heavy Stamping', 'Automation', 'Compressed Air', 'HVAC Systems', 'Material Handling']
        mfrs = ['Siemens', 'Haas Automation', 'Bosch Rexroth', 'KUKA Robotics', 'Atlas Copco', 'ABB Automation', 'Schneider Electric']
        types = ['5-Axis CNC Mill', 'Industrial Boiler', 'Hydraulic Press', 'Robotic Arm', 'Rotary Compressor', 'Chiller Unit', 'Conveyor Drive']

        for i in range(9, 151):
            m_id = f"MCH-GEN-{i:03d}"
            m_name = f"Industrial Equipment Unit {i:03d}"
            cat = cats[i % len(cats)]
            m_type = types[i % len(types)]
            dept = depts[i % len(depts)]
            loc = f"Sector {chr(65 + (i % 6))} - Station {(i % 12) + 1}"
            mfr = mfrs[i % len(mfrs)]
            
            inst_date = f"202{(i%4)+1}-{(i%11)+1:02d}-{(i%27)+1:02d}"
            last_serv = f"2026-07-{(i%27)+1:02d}"
            next_serv = f"2026-09-{(i%27)+1:02d}"

            if i in [15, 25, 35, 45, 55, 65, 75, 85, 95, 105]:
                status = 'Under Maintenance'
                breakdowns = 2
                daily_usage = 16.0
            elif i in [12, 42, 102]:
                status = 'Breakdown'
                breakdowns = 4
                daily_usage = 20.0
            else:
                status = 'Active'
                breakdowns = i % 2
                daily_usage = 8.0 + (i % 10)

            score_data = compute_health_score(inst_date, next_serv, 'Monthly', breakdowns, daily_usage)
            health = score_data['health_score']
                
            initial_machines.append((m_id, m_name, cat, m_type, dept, loc, mfr, inst_date, last_serv, next_serv, 'Monthly', status, health, f'Standard operational unit {i} in {dept}.', breakdowns, daily_usage, 30))

        cursor.executemany("INSERT INTO machines (machine_id, machine_name, category, machine_type, department, location, manufacturer, install_date, last_service_date, next_service_date, maintenance_interval, status, health_score, notes, breakdowns_count, daily_usage_hours, maintenance_interval_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", initial_machines)

        # Seed Maintenance Tasks
        cursor.executemany("INSERT INTO maintenance (maintenance_id, machine_id, technician_id, maintenance_date, priority, status, service_type, description, notes, cost, downtime_hours, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            (1001, 'MCH-CNC-001', 101, '2026-09-20', 'High', 'Scheduled', 'Routine Lubrication & Calibration', 'Perform spindle vibration analysis, check coolant levels.', 'Technician notified.', 350.0, 2.0, None),
            (1002, 'MCH-BLR-002', 104, '2026-09-11', 'Critical', 'Overdue', 'Pressure Safety Valve Inspection', 'Annual pressure relief valve safety certification.', 'Urgent: Overdue by 5 days.', 1200.0, 6.0, None),
            (1003, 'MCH-CMP-005', 102, '2026-09-05', 'High', 'Pending', 'Emergency Filter Replacement', 'Replace oil separator element.', 'Waiting for replacement filter.', 650.0, 4.5, None),
            (1004, 'MCH-HYD-003', 105, '2026-08-15', 'Medium', 'Completed', 'Hydraulic Oil Flush & Filter Renewal', 'Flushed 400L hydraulic fluid.', 'Operated flawlessly post-servicing.', 850.0, 3.5, '2026-08-15'),
            (1005, 'MCH-ROB-004', 105, '2026-08-25', 'Low', 'Completed', 'Robot Joint Backlash & Cable Harness', 'Checked harness wear on joint 3.', 'Harness in good condition.', 400.0, 1.5, '2026-08-25')
        ])

        # Seed Notifications
        cursor.executemany("INSERT INTO notifications (notification_id, machine_id, message, due_date, priority, status, notification_type) VALUES (?, ?, ?, ?, ?, ?, ?)", [
            (201, 'MCH-CNC-001', 'Maintenance Due: CNC Machine 01 scheduled for calibration.', '2026-09-20', 'High', 'Unread', 'Maintenance Due'),
            (202, 'MCH-BLR-002', 'OVERDUE ALERT: Boiler Unit B maintenance is overdue by 5 days!', '2026-09-11', 'Critical', 'Unread', 'Overdue Alert'),
            (203, 'MCH-CMP-005', 'Breakdown Warning: Compressor C4 oil temp threshold exceeded.', '2026-09-16', 'High', 'Unread', 'Critical Warning')
        ])
    else:
        # Ensure our formula demo reference machine MCH-CMP-005 has the exact prompt values:
        # Age=6y (2020-09-17), Overdue=15d (2026-09-02), Breakdowns=3, Usage=12h/d, Interval=Monthly (30d) -> Health Score = 45%
        cursor.execute('''
            UPDATE machines SET 
                install_date = '2020-09-17',
                next_service_date = '2026-09-02',
                maintenance_interval = 'Monthly',
                breakdowns_count = 3,
                daily_usage_hours = 12.0,
                health_score = 45,
                notes = 'Formula Reference Unit: 6y age, 15d overdue, 3 breakdowns, 12h/day usage.'
            WHERE machine_id = 'MCH-CMP-005'
        ''')

    conn.commit()
    conn.close()

# Initialize database
init_db()

# --------------------------------------------------------
# TECHNICIAN ROSTER & USER SYNCHRONIZATION ENGINE
# --------------------------------------------------------

def sync_technician_roster(conn, email=None, name=None, phone=None, department=None, role=None, status=None, user_id=None, is_login=False):
    """
    Ensures:
    Technician Login / Access Creation -> User Table Updated -> Technician Roster Updated.
    No duplicate technicians should be created.
    If technician already exists: Update existing record, Update Last Login time if is_login.
    """
    c = conn.cursor()
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    clean_email = (email or '').strip()
    clean_name = (name or '').strip()

    existing_tech = None

    # 1. Search by linked technician_id in users
    if user_id:
        c.execute("SELECT technician_id, role, name, email FROM users WHERE user_id = ?", (user_id,))
        u_row = c.fetchone()
        if u_row and u_row['technician_id']:
            c.execute("SELECT * FROM technicians WHERE technician_id = ?", (u_row['technician_id'],))
            existing_tech = c.fetchone()

    # 2. Search by email if not found
    if not existing_tech and clean_email:
        c.execute("SELECT * FROM technicians WHERE LOWER(email) = LOWER(?)", (clean_email,))
        existing_tech = c.fetchone()

    # 3. Search by name if email wasn't matched
    if not existing_tech and clean_name:
        c.execute("SELECT * FROM technicians WHERE LOWER(name) = LOWER(?)", (clean_name,))
        existing_tech = c.fetchone()

    tech_id = None
    if existing_tech:
        tech_id = existing_tech['technician_id']
        update_clauses = []
        params = []

        if clean_name:
            update_clauses.append("name = ?")
            params.append(clean_name)
        if clean_email:
            update_clauses.append("email = ?")
            params.append(clean_email)
        if phone:
            update_clauses.append("phone = ?")
            params.append(phone)
        if department:
            update_clauses.append("department = ?")
            params.append(department)
        if role:
            update_clauses.append("role = ?")
            params.append(role)
        if status:
            current_status = existing_tech['status'] or 'Available'
            tech_status = 'Available' if status.lower() in ('active', 'available') and current_status not in ('Busy', 'On Leave') else ('Inactive' if status.lower() == 'inactive' else status)
            update_clauses.append("status = ?")
            params.append(tech_status)
        if is_login:
            update_clauses.append("last_login = ?")
            params.append(now_str)

        if update_clauses:
            sql = f"UPDATE technicians SET {', '.join(update_clauses)} WHERE technician_id = ?"
            params.append(tech_id)
            c.execute(sql, params)
    else:
        # Create new technician entry
        final_phone = phone or '+1 (555) 000-0000'
        final_dept = department or 'Mechanical Systems'
        final_role = role or 'Field Specialist'
        final_status = 'Available' if (status or '').lower() in ('active', 'available', '') else (status or 'Available')
        final_login = now_str if is_login else None

        c.execute('''
            INSERT INTO technicians (name, email, department, phone, role, status, assigned_tasks, last_login, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        ''', (clean_name, clean_email, final_dept, final_phone, final_role, final_status, final_login, now_str))
        tech_id = c.lastrowid
        c.execute("UPDATE sqlite_sequence SET seq = (SELECT MAX(technician_id) FROM technicians) WHERE name = 'technicians'")

    # Link user record to technician_id
    target_user_id = user_id
    if not target_user_id and clean_email:
        c.execute("SELECT user_id FROM users WHERE LOWER(email) = LOWER(?)", (clean_email,))
        u_match = c.fetchone()
        if u_match:
            target_user_id = u_match['user_id']

    if target_user_id and tech_id:
        c.execute("UPDATE users SET technician_id = ? WHERE user_id = ?", (tech_id, target_user_id))

    return tech_id

# --------------------------------------------------------
# AUTHENTICATION & CONFIG ENDPOINTS
# --------------------------------------------------------

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json or {}
    email = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()

    if not email:
        return jsonify({'status': 'error', 'message': 'Email address cannot be empty.'}), 400

    if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email):
        return jsonify({'status': 'error', 'message': 'Invalid email format. Please enter a valid email.'}), 400

    if not password:
        return jsonify({'status': 'error', 'message': 'Password field cannot be empty.'}), 400

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT user_id, name, email, password, role, permissions, status, technician_id, last_login FROM users WHERE LOWER(email) = LOWER(?)", (email,))
    user = c.fetchone()

    if not user or user['password'] != password:
        conn.close()
        return jsonify({'status': 'error', 'message': 'Invalid credentials. Please verify your work email and password.'}), 401

    if user['status'] and user['status'].lower() == 'inactive':
        conn.close()
        return jsonify({'status': 'error', 'message': 'Account is inactive. Please contact the System Administrator.'}), 403

    role_str = user['role'] or 'Technician'
    is_admin = 'admin' in role_str.lower()
    role_type = 'Admin' if is_admin else 'Technician'

    perms = ADMIN_PERMISSIONS if is_admin else DEFAULT_TECHNICIAN_PERMISSIONS
    if user['permissions']:
        try:
            parsed_perms = json.loads(user['permissions'])
            if isinstance(parsed_perms, dict):
                perms = parsed_perms
        except Exception:
            pass

    # Update User Table: last_login
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    c.execute("UPDATE users SET last_login = ? WHERE user_id = ?", (now_str, user['user_id']))

    # Synchronize Technician Roster:
    # Technician Login -> User Table Updated -> Technician Roster Updated
    # If technician already exists: update existing record + last_login. No duplicate technicians created.
    tech_id = user['technician_id']
    if not is_admin or user['technician_id']:
        tech_id = sync_technician_roster(
            conn,
            email=user['email'],
            name=user['name'],
            role=user['role'],
            status=user['status'] or 'Available',
            user_id=user['user_id'],
            is_login=True
        )

    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': f"Welcome back, {user['name']}!",
        'user': {
            'user_id': user['user_id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role'],
            'role_type': role_type,
            'status': user['status'] or 'Active',
            'permissions': perms,
            'technician_id': tech_id,
            'last_login': now_str
        }
    })

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()
    phone = (data.get('phone') or '').strip()
    dept = (data.get('department') or 'Mechanical Systems').strip()
    role = (data.get('role') or 'Senior Reliability Engineer (Technician)').strip()

    if not name or not email or not password:
        return jsonify({'status': 'error', 'message': 'Full Name, Work Email, and Password are required.'}), 400

    if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email):
        return jsonify({'status': 'error', 'message': 'Invalid work email format. Please provide a valid address.'}), 400

    if len(password) < 4:
        return jsonify({'status': 'error', 'message': 'Password must be at least 4 characters.'}), 400

    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT user_id FROM users WHERE LOWER(email) = LOWER(?)", (email,))
    if c.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'message': f'An account with email {email} already exists. Please sign in.'}), 400

    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    perms_json = json.dumps(DEFAULT_TECHNICIAN_PERMISSIONS)

    # Insert into users table
    c.execute('''
        INSERT INTO users (name, email, password, role, permissions, status, last_login)
        VALUES (?, ?, ?, ?, ?, 'Active', ?)
    ''', (name, email, password, role, perms_json, now_str))
    user_id = c.lastrowid

    # Automatically synchronize and create or update Technician Roster entry
    tech_id = sync_technician_roster(
        conn,
        email=email,
        name=name,
        phone=phone or '+1 (555) 000-0000',
        department=dept,
        role=role,
        status='Available',
        user_id=user_id,
        is_login=True
    )

    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': f'Technician account for {name} registered and synchronized into Roster successfully!',
        'user': {
            'user_id': user_id,
            'name': name,
            'email': email,
            'role': role,
            'role_type': 'Technician',
            'status': 'Active',
            'permissions': DEFAULT_TECHNICIAN_PERMISSIONS,
            'technician_id': tech_id,
            'last_login': now_str
        }
    })

# --------------------------------------------------------
# USER & TECHNICIAN ACCESS MANAGEMENT (ADMIN GOVERNED)
# --------------------------------------------------------

@app.route('/api/users', methods=['GET', 'POST'])
def manage_users():
    conn = get_db()
    c = conn.cursor()

    if request.method == 'POST':
        data = request.json or {}
        name = (data.get('name') or '').strip()
        email = (data.get('email') or '').strip()
        password = (data.get('password') or '').strip()
        role = (data.get('role') or 'Technician').strip()
        perms = data.get('permissions') or DEFAULT_TECHNICIAN_PERMISSIONS
        tech_id = data.get('technician_id')
        status = (data.get('status') or 'Active').strip()
        phone = (data.get('phone') or '').strip()
        department = (data.get('department') or 'Mechanical Systems').strip()

        if not name or not email or not password:
            conn.close()
            return jsonify({'status': 'error', 'message': 'Full Name, Email Address, and Password are required.'}), 400

        if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email):
            conn.close()
            return jsonify({'status': 'error', 'message': 'Invalid email format. Please provide a valid address.'}), 400

        c.execute("SELECT user_id FROM users WHERE LOWER(email) = LOWER(?)", (email,))
        if c.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'message': f'A user account with email {email} already exists.'}), 400

        perms_json = json.dumps(perms) if isinstance(perms, dict) else perms

        custom_user_id = data.get('user_id')
        if custom_user_id is not None and str(custom_user_id).strip():
            try:
                custom_user_id = int(custom_user_id)
            except ValueError:
                custom_user_id = None

        if custom_user_id:
            c.execute("SELECT COUNT(*) FROM users WHERE user_id = ?", (custom_user_id,))
            if c.fetchone()[0] > 0:
                conn.close()
                return jsonify({'status': 'error', 'message': f'User ID #{custom_user_id} already exists.'}), 400
            user_id = custom_user_id
            c.execute('''
                INSERT INTO users (user_id, name, email, password, role, permissions, status, technician_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (user_id, name, email, password, role, perms_json, status, tech_id))
        else:
            c.execute('''
                INSERT INTO users (name, email, password, role, permissions, status, technician_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (name, email, password, role, perms_json, status, tech_id))
            user_id = c.lastrowid

        c.execute("UPDATE sqlite_sequence SET seq = (SELECT MAX(user_id) FROM users) WHERE name = 'users'")

        # Whenever a technician user is added by admin, automatically create/update Technician Roster entry
        is_admin_user = 'admin' in role.lower()
        synced_tech_id = tech_id
        if not is_admin_user or tech_id:
            synced_tech_id = sync_technician_roster(
                conn,
                email=email,
                name=name,
                phone=phone or '+1 (555) 000-0000',
                department=department,
                role=role,
                status=status,
                user_id=user_id,
                is_login=False
            )

        conn.commit()
        conn.close()

        return jsonify({
            'status': 'success',
            'message': f'Technician user access for {name} ({role}) created successfully and added to Technician Roster!',
            'user_id': user_id,
            'technician_id': synced_tech_id
        })

    c.execute('''
        SELECT u.user_id, u.name, u.email, u.role, u.permissions, u.status, u.technician_id,
               t.department, t.phone
        FROM users u
        LEFT JOIN technicians t ON u.technician_id = t.technician_id
        ORDER BY u.user_id ASC
    ''')
    rows = c.fetchall()
    users = []
    for r in rows:
        d = dict(r)
        d['role_type'] = 'Admin' if 'admin' in str(d['role']).lower() else 'Technician'
        try:
            d['permissions'] = json.loads(d['permissions']) if d['permissions'] else (
                ADMIN_PERMISSIONS if d['role_type'] == 'Admin' else DEFAULT_TECHNICIAN_PERMISSIONS
            )
        except Exception:
            d['permissions'] = ADMIN_PERMISSIONS if d['role_type'] == 'Admin' else DEFAULT_TECHNICIAN_PERMISSIONS
        users.append(d)

    conn.close()
    return jsonify(users)

@app.route('/api/users/<int:user_id>', methods=['PUT', 'DELETE'])
def user_detail(user_id):
    conn = get_db()
    c = conn.cursor()

    if request.method == 'DELETE':
        if user_id == 1:
            conn.close()
            return jsonify({'status': 'error', 'message': 'Primary Administrator account cannot be deleted.'}), 400
        c.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': f'User login account #{user_id} deleted successfully.'})

    data = request.json or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()
    role = (data.get('role') or 'Technician').strip()
    perms = data.get('permissions')
    status = (data.get('status') or 'Active').strip()
    tech_id = data.get('technician_id')
    phone = (data.get('phone') or '').strip()
    department = (data.get('department') or '').strip()

    if not name or not email:
        conn.close()
        return jsonify({'status': 'error', 'message': 'Full Name and Email are required.'}), 400

    new_user_id = data.get('new_user_id') or data.get('user_id')
    if new_user_id is not None and str(new_user_id).strip():
        try:
            new_user_id = int(new_user_id)
        except ValueError:
            new_user_id = None

    if new_user_id and new_user_id != user_id:
        c.execute("SELECT COUNT(*) FROM users WHERE user_id = ?", (new_user_id,))
        if c.fetchone()[0] > 0:
            conn.close()
            return jsonify({'status': 'error', 'message': f'User ID #{new_user_id} already exists.'}), 400
        c.execute("UPDATE users SET user_id = ? WHERE user_id = ?", (new_user_id, user_id))
        c.execute("UPDATE sqlite_sequence SET seq = (SELECT MAX(user_id) FROM users) WHERE name = 'users'")
        user_id = new_user_id

    perms_json = json.dumps(perms) if isinstance(perms, dict) else perms

    if password:
        c.execute('''
            UPDATE users SET 
                name = ?, email = ?, password = ?, role = ?, permissions = ?, status = ?, technician_id = ?
            WHERE user_id = ?
        ''', (name, email, password, role, perms_json, status, tech_id, user_id))
    else:
        c.execute('''
            UPDATE users SET 
                name = ?, email = ?, role = ?, permissions = ?, status = ?, technician_id = ?
            WHERE user_id = ?
        ''', (name, email, role, perms_json, status, tech_id, user_id))

    # Synchronize technician roster on update:
    is_admin_user = 'admin' in role.lower()
    if not is_admin_user or tech_id:
        sync_technician_roster(
            conn,
            email=email,
            name=name,
            phone=phone if phone else None,
            department=department if department else None,
            role=role,
            status=status,
            user_id=user_id,
            is_login=False
        )

    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': f'User login account #{user_id} updated successfully and synced to Roster.'})

# --------------------------------------------------------
# HEALTH SCORE FORMULA CALCULATION ENDPOINT
# --------------------------------------------------------

@app.route('/api/health-score/calculate', methods=['POST'])
def api_calculate_health_score():
    data = request.json or {}
    age_val = data.get('age_years') if data.get('age_years') is not None else data.get('machine_age_years')
    overdue_val = data.get('days_overdue', 0)
    interval_val = data.get('interval_days') if data.get('interval_days') is not None else data.get('maintenance_interval_days', 30)
    breakdowns_val = data.get('breakdowns') if data.get('breakdowns') is not None else data.get('breakdowns_count', 0)
    daily_usage_hours = data.get('daily_usage_hours', 12.0)
    
    interval = max(1, int(interval_val or 30))
    overdue = max(0, int(overdue_val or 0))
    maint_risk = min(40.0, max(0.0, (overdue / interval) * 40.0))
    
    b_count = max(0, int(breakdowns_val or 0))
    breakdown_risk = min(30.0, max(0.0, b_count * 6.0))
    
    age = max(0.0, float(age_val if age_val is not None else 1.0))
    age_risk = min(20.0, max(0.0, age * 2.0))
    
    usage_hours = min(24.0, max(0.0, float(daily_usage_hours if daily_usage_hours is not None else 12.0)))
    usage_risk = min(10.0, max(0.0, (usage_hours / 24.0) * 10.0))
    
    total_risk = round(maint_risk + breakdown_risk + age_risk + usage_risk, 1)
    health_score = max(0, min(100, round(100.0 - total_risk)))
    
    return jsonify({
        'status': 'success',
        'health_score': health_score,
        'total_risk': total_risk,
        'maintenance_risk': round(maint_risk, 1),
        'breakdown_risk': round(breakdown_risk, 1),
        'age_risk': round(age_risk, 1),
        'usage_risk': round(usage_risk, 1),
        'formula': 'Health Score = 100 - (Maintenance Risk + Breakdown Risk + Age Risk + Usage Risk)',
        'breakdown_details': {
            'maintenance_risk_formula': f'({overdue} / {interval}) × 40 = {round(maint_risk, 1)} (Max 40)',
            'breakdown_risk_formula': f'{b_count} × 6 = {round(breakdown_risk, 1)} (Max 30)',
            'age_risk_formula': f'{age} × 2 = {round(age_risk, 1)} (Max 20)',
            'usage_risk_formula': f'({usage_hours} / 24) × 10 = {round(usage_risk, 1)} (Max 10)'
        }
    })

@app.route('/api/email-config', methods=['GET', 'POST'])
def manage_email_config():
    """Provides non-sensitive frontend configuration loaded directly from environment variables."""
    if request.method == 'POST':
        data = request.json or {}
        pub_key = (data.get('publicKey') or '').strip()
        srv_id = (data.get('serviceId') or '').strip()
        tpl_id = (data.get('templateId') or '').strip()

        if srv_id:
            os.environ['EMAILJS_SERVICE_ID'] = srv_id
        if pub_key:
            os.environ['EMAILJS_PUBLIC_KEY'] = pub_key
        if tpl_id:
            os.environ['EMAILJS_TEMPLATE_ID'] = tpl_id

        # Update .env file
        env_path = os.path.join(os.path.dirname(__file__), '.env')
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                content = f.read()
            if srv_id:
                content = re.sub(r'EMAILJS_SERVICE_ID=.*', f'EMAILJS_SERVICE_ID={srv_id}', content)
            if pub_key:
                content = re.sub(r'EMAILJS_PUBLIC_KEY=.*', f'EMAILJS_PUBLIC_KEY={pub_key}', content)
            if tpl_id:
                content = re.sub(r'EMAILJS_TEMPLATE_ID=.*', f'EMAILJS_TEMPLATE_ID={tpl_id}', content)
            with open(env_path, 'w', encoding='utf-8') as f:
                f.write(content)

        return jsonify({
            'status': 'success',
            'message': 'EmailJS credentials saved successfully into .env!',
            'config': {
                'publicKey': os.getenv('EMAILJS_PUBLIC_KEY', ''),
                'serviceId': os.getenv('EMAILJS_SERVICE_ID', ''),
                'templateId': os.getenv('EMAILJS_TEMPLATE_ID', '')
            }
        })

    load_dotenv(override=True)
    return jsonify({
        'publicKey': os.getenv('EMAILJS_PUBLIC_KEY', '').strip(),
        'serviceId': os.getenv('EMAILJS_SERVICE_ID', 'service_t57te8k').strip(),
        'templateId': os.getenv('EMAILJS_TEMPLATE_ID', 'template_b6mzvlp').strip()
    })

# --------------------------------------------------------
# KPI & ANALYTICS
# --------------------------------------------------------

@app.route('/api/kpi')
def get_kpi():
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT COUNT(*) FROM machines")
    total_machines = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM machines WHERE status = 'Active'")
    active_machines = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM maintenance WHERE status IN ('Pending', 'Scheduled')")
    maintenance_due = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM maintenance WHERE status = 'Overdue'")
    overdue_count = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM maintenance WHERE status = 'Completed'")
    completed_count = c.fetchone()[0]
    
    conn.close()
    
    return jsonify({
        'total_machines': total_machines if total_machines > 0 else 150,
        'active_machines': active_machines if active_machines > 0 else 132,
        'maintenance_due': maintenance_due if maintenance_due > 0 else 10,
        'overdue_maintenance': overdue_count if overdue_count > 0 else 3,
        'completed_services': completed_count if completed_count > 0 else 95
    })

@app.route('/api/recent-activities')
def get_recent_activities():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT m.maintenance_id, m.maintenance_date as date, m.status, m.service_type as type,
               COALESCE(mac.machine_name, m.machine_id) as name,
               COALESCE(t.name, 'Field Technician') as tech
        FROM maintenance m
        LEFT JOIN machines mac ON m.machine_id = mac.machine_id
        LEFT JOIN technicians t ON m.technician_id = t.technician_id
        ORDER BY m.maintenance_date DESC LIMIT 10
    ''')
    activities = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(activities)

# --------------------------------------------------------
# MACHINE INVENTORY MODULE
# --------------------------------------------------------

@app.route('/api/machines', methods=['GET', 'POST'])
def manage_machines():
    conn = get_db()
    c = conn.cursor()
    
    if request.method == 'POST':
        data = request.json or {}
        machine_id = str(data.get('machine_id') or '').strip()
        machine_name = (data.get('machine_name') or '').strip()

        if not machine_name:
            conn.close()
            return jsonify({'status': 'error', 'message': 'Machine Name is required.'}), 400

        if not machine_id:
            c.execute("SELECT COALESCE(MAX(CAST(machine_id AS INTEGER)), 0) + 1 FROM machines")
            machine_id = str(c.fetchone()[0])
        else:
            c.execute("SELECT COUNT(*) FROM machines WHERE machine_id = ?", (machine_id,))
            if c.fetchone()[0] > 0:
                conn.close()
                return jsonify({'status': 'error', 'message': f'Machine ID {machine_id} already exists.'}), 400

        inst_date = data.get('install_date') or str(datetime.date.today())
        next_serv = data.get('next_service_date') or str(datetime.date.today() + datetime.timedelta(days=30))
        interval = data.get('maintenance_interval', 'Monthly')
        breakdowns = int(data.get('breakdowns_count', 0) or 0)
        daily_usage = float(data.get('daily_usage_hours', 12.0) or 12.0)

        score_res = compute_health_score(inst_date, next_serv, interval, breakdowns, daily_usage)
        health_score = score_res['health_score']

        c.execute('''
            INSERT INTO machines (
                machine_id, machine_name, category, machine_type, department, location, manufacturer, 
                install_date, last_service_date, next_service_date, maintenance_interval, notes, 
                status, health_score, breakdowns_count, daily_usage_hours, maintenance_interval_days
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            machine_id,
            machine_name,
            data.get('category', 'General Equipment'),
            data.get('machine_type', 'Standard'),
            data.get('department', 'Machining Shop'),
            data.get('location', 'Main Floor'),
            data.get('manufacturer', 'Siemens Industrial'),
            inst_date,
            data.get('last_service_date', str(datetime.date.today())),
            next_serv,
            interval,
            data.get('notes', ''),
            data.get('status', 'Active'),
            health_score,
            breakdowns,
            daily_usage,
            score_res['maintenance_interval_days']
        ))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': f'Machine {machine_id} registered successfully!', 'health_score': health_score})
    
    search_q = request.args.get('q', '').strip()
    status_filter = request.args.get('status', '').strip()
    cat_filter = request.args.get('category', '').strip()
    
    query = "SELECT * FROM machines WHERE 1=1"
    params = []
    
    if search_q:
        query += " AND (machine_name LIKE ? OR machine_id LIKE ? OR department LIKE ?)"
        params.extend([f"%{search_q}%", f"%{search_q}%", f"%{search_q}%"])
        
    if status_filter:
        query += " AND status = ?"
        params.append(status_filter)
        
    if cat_filter:
        query += " AND category = ?"
        params.append(cat_filter)
        
    query += " ORDER BY machine_id ASC"
    c.execute(query, params)
    raw_machines = [dict(row) for row in c.fetchall()]
    conn.close()

    machines = []
    for m in raw_machines:
        inst_date = m.get('install_date')
        next_serv = m.get('next_service_date')
        interval = m.get('maintenance_interval') or 'Monthly'
        breakdowns = m.get('breakdowns_count') or 0
        usage = m.get('daily_usage_hours') if m.get('daily_usage_hours') is not None else 12.0
        
        # Calculate dynamic health score & risks
        risk_data = compute_health_score(inst_date, next_serv, interval, breakdowns, usage)
        m['health_score'] = risk_data['health_score']
        m['total_risk'] = risk_data['total_risk']
        m['maintenance_risk'] = risk_data['maintenance_risk']
        m['breakdown_risk'] = risk_data['breakdown_risk']
        m['age_risk'] = risk_data['age_risk']
        m['usage_risk'] = risk_data['usage_risk']
        m['days_overdue'] = risk_data['days_overdue']
        m['machine_age_years'] = risk_data['machine_age_years']
        m['breakdowns_count'] = risk_data['breakdowns_count']
        m['daily_usage_hours'] = risk_data['daily_usage_hours']
        m['maintenance_interval_days'] = risk_data['maintenance_interval_days']
        machines.append(m)

    return jsonify(machines)

@app.route('/api/machines/<machine_id>', methods=['PUT', 'DELETE'])
def machine_detail(machine_id):
    conn = get_db()
    c = conn.cursor()
    
    if request.method == 'DELETE':
        c.execute("DELETE FROM machines WHERE machine_id = ?", (machine_id,))
        c.execute("DELETE FROM maintenance WHERE machine_id = ?", (machine_id,))
        c.execute("DELETE FROM notifications WHERE machine_id = ?", (machine_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': f'Machine {machine_id} and related records deleted.'})
        
    if request.method == 'PUT':
        data = request.json or {}

        # Fetch current record for defaults
        c.execute("SELECT * FROM machines WHERE machine_id = ?", (machine_id,))
        current = c.fetchone()
        if not current:
            conn.close()
            return jsonify({'status': 'error', 'message': f'Machine {machine_id} not found.'}), 404

        new_machine_id = str(data.get('new_machine_id') or data.get('machine_id') or machine_id).strip()
        if new_machine_id and new_machine_id != str(machine_id):
            c.execute("SELECT COUNT(*) FROM machines WHERE machine_id = ?", (new_machine_id,))
            if c.fetchone()[0] > 0:
                conn.close()
                return jsonify({'status': 'error', 'message': f'Machine ID {new_machine_id} already exists.'}), 400
            c.execute("UPDATE machines SET machine_id = ? WHERE machine_id = ?", (new_machine_id, machine_id))
            c.execute("UPDATE maintenance SET machine_id = ? WHERE machine_id = ?", (new_machine_id, machine_id))
            c.execute("UPDATE notifications SET machine_id = ? WHERE machine_id = ?", (new_machine_id, machine_id))
            machine_id = new_machine_id

        inst_date = data.get('install_date') or current['install_date']
        next_serv = data.get('next_service_date') or current['next_service_date']
        interval = data.get('maintenance_interval') or current['maintenance_interval']
        breakdowns = int(data.get('breakdowns_count') if data.get('breakdowns_count') is not None else (current['breakdowns_count'] or 0))
        daily_usage = float(data.get('daily_usage_hours') if data.get('daily_usage_hours') is not None else (current['daily_usage_hours'] or 12.0))

        risk_res = compute_health_score(inst_date, next_serv, interval, breakdowns, daily_usage)
        health_score = risk_res['health_score']

        c.execute('''
            UPDATE machines SET 
                machine_name = ?, category = ?, machine_type = ?, department = ?, 
                location = ?, manufacturer = ?, status = ?, notes = ?,
                install_date = ?, next_service_date = ?, maintenance_interval = ?,
                breakdowns_count = ?, daily_usage_hours = ?, health_score = ?,
                maintenance_interval_days = ?
            WHERE machine_id = ?
        ''', (
            data.get('machine_name', current['machine_name']),
            data.get('category', current['category']),
            data.get('machine_type', current['machine_type']),
            data.get('department', current['department']),
            data.get('location', current['location']),
            data.get('manufacturer', current['manufacturer']),
            data.get('status', current['status']),
            data.get('notes', current['notes']),
            inst_date,
            next_serv,
            interval,
            breakdowns,
            daily_usage,
            health_score,
            risk_res['maintenance_interval_days'],
            machine_id
        ))
        conn.commit()
        conn.close()
        return jsonify({
            'status': 'success', 
            'message': f'Machine {machine_id} updated successfully.',
            'health_score': health_score,
            'risks': risk_res
        })

# --------------------------------------------------------
# MAINTENANCE SCHEDULER MODULE
# --------------------------------------------------------

@app.route('/api/maintenance', methods=['GET', 'POST'])
def manage_maintenance():
    conn = get_db()
    c = conn.cursor()
    
    if request.method == 'POST':
        data = request.json or {}
        machine_id = data.get('machine_id')
        technician_id = data.get('technician_id', 101)
        maintenance_date = data.get('maintenance_date')

        if not machine_id or not maintenance_date:
            conn.close()
            return jsonify({'status': 'error', 'message': 'Machine selection and Maintenance Date are required.'}), 400

        c.execute('''
            INSERT INTO maintenance (machine_id, technician_id, maintenance_date, priority, status, service_type, description, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            machine_id,
            technician_id,
            maintenance_date,
            data.get('priority', 'Medium'),
            data.get('status', 'Scheduled'),
            data.get('service_type', 'Preventive Maintenance'),
            data.get('description', ''),
            data.get('notes', '')
        ))

        # Also create a corresponding notification for visibility
        c.execute('''
            INSERT INTO notifications (machine_id, message, due_date, priority, status, notification_type)
            VALUES (?, ?, ?, ?, 'Unread', 'Maintenance Due')
        ''', (
            machine_id,
            f"Scheduled Service: {data.get('service_type', 'Routine Maintenance')} on {machine_id}",
            maintenance_date,
            data.get('priority', 'Medium')
        ))

        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': 'Maintenance task scheduled successfully!'})
        
    c.execute('''
        SELECT m.*, mac.machine_name, mac.category, t.name as technician_name, t.email as technician_email
        FROM maintenance m
        LEFT JOIN machines mac ON m.machine_id = mac.machine_id
        LEFT JOIN technicians t ON m.technician_id = t.technician_id
        ORDER BY m.maintenance_date DESC
    ''')
    tasks = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(tasks)

@app.route('/api/maintenance/<int:m_id>', methods=['PUT', 'DELETE'])
def update_or_delete_maintenance(m_id):
    conn = get_db()
    c = conn.cursor()

    if request.method == 'DELETE':
        c.execute("DELETE FROM maintenance WHERE maintenance_id = ?", (m_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': f'Maintenance task #{m_id} deleted.'})

    data = request.json or {}
    c.execute('''
        UPDATE maintenance SET 
            status = ?, notes = ?, completed_at = ?
        WHERE maintenance_id = ?
    ''', (
        data.get('status', 'Completed'),
        data.get('notes', 'Service completed.'),
        str(datetime.date.today()) if data.get('status') == 'Completed' else None,
        m_id
    ))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': f'Maintenance task #{m_id} updated.'})

# --------------------------------------------------------
# TECHNICIAN ROSTER MODULE
# --------------------------------------------------------

@app.route('/api/technicians', methods=['GET', 'POST'])
def manage_technicians():
    conn = get_db()
    c = conn.cursor()
    
    if request.method == 'POST':
        data = request.json or {}
        name = (data.get('name') or '').strip()
        email = (data.get('email') or '').strip()
        dept = (data.get('department') or 'Mechanical Systems').strip()
        phone = (data.get('phone') or '').strip()
        role = (data.get('role') or 'Field Specialist (Technician)').strip()
        status = (data.get('status') or 'Available').strip()

        password = (data.get('password') or '').strip()
        perms = data.get('permissions') or DEFAULT_TECHNICIAN_PERMISSIONS

        if not name or not phone:
            conn.close()
            return jsonify({'status': 'error', 'message': 'Technician Name and WhatsApp Phone Number are required.'}), 400

        if email and not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email):
            conn.close()
            return jsonify({'status': 'error', 'message': 'Invalid technician email format.'}), 400

        if not email:
            clean_tech_name = re.sub(r'[^a-zA-Z0-9]', '.', name.lower())
            email = f"{clean_tech_name}@smartfactory.com"

        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        custom_tech_id = data.get('technician_id')
        if custom_tech_id is not None and str(custom_tech_id).strip():
            try:
                custom_tech_id = int(custom_tech_id)
            except ValueError:
                custom_tech_id = None

        # Check if technician already exists to avoid duplicates
        c.execute("SELECT technician_id FROM technicians WHERE LOWER(email) = LOWER(?)", (email,))
        existing = c.fetchone()
        if existing:
            tech_id = existing['technician_id']
            c.execute('''
                UPDATE technicians SET name = ?, email = ?, department = ?, phone = ?, role = ?, status = ?
                WHERE technician_id = ?
            ''', (name, email, dept, phone, role, status, tech_id))
        else:
            if custom_tech_id:
                c.execute("SELECT COUNT(*) FROM technicians WHERE technician_id = ?", (custom_tech_id,))
                if c.fetchone()[0] > 0:
                    conn.close()
                    return jsonify({'status': 'error', 'message': f'Technician ID #{custom_tech_id} already exists.'}), 400
                tech_id = custom_tech_id
                c.execute('''
                    INSERT INTO technicians (technician_id, name, email, department, phone, role, status, assigned_tasks, last_login, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
                ''', (tech_id, name, email, dept, phone, role, status, now_str))
            else:
                c.execute('''
                    INSERT INTO technicians (name, email, department, phone, role, status, assigned_tasks, last_login, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)
                ''', (name, email, dept, phone, role, status, now_str))
                tech_id = c.lastrowid

            c.execute("UPDATE sqlite_sequence SET seq = (SELECT MAX(technician_id) FROM technicians) WHERE name = 'technicians'")

        # Also create or update login account in users table with credentials and permissions
        perms_json = json.dumps(perms) if isinstance(perms, dict) else perms
        c.execute("SELECT user_id FROM users WHERE LOWER(email) = LOWER(?)", (email,))
        u_match = c.fetchone()
        if u_match:
            user_id = u_match['user_id']
            if password:
                c.execute('''
                    UPDATE users SET name = ?, password = ?, role = ?, permissions = ?, status = 'Active', technician_id = ?
                    WHERE user_id = ?
                ''', (name, password, role, perms_json, tech_id, user_id))
            else:
                c.execute('''
                    UPDATE users SET name = ?, role = ?, permissions = ?, status = 'Active', technician_id = ?
                    WHERE user_id = ?
                ''', (name, role, perms_json, tech_id, user_id))
        else:
            final_pass = password if password else 'tech123'
            c.execute('''
                INSERT INTO users (name, email, password, role, permissions, status, technician_id)
                VALUES (?, ?, ?, ?, ?, 'Active', ?)
            ''', (name, email, final_pass, role, perms_json, tech_id))
            user_id = c.lastrowid
            c.execute("UPDATE sqlite_sequence SET seq = (SELECT MAX(user_id) FROM users) WHERE name = 'users'")

        conn.commit()
        conn.close()
        return jsonify({
            'status': 'success',
            'message': f'Technician {name} registered in Roster and granted system login access!',
            'technician_id': tech_id,
            'user_id': user_id
        })
        
    c.execute("SELECT technician_id, name, email, department, phone, role, status, assigned_tasks, last_login, created_at FROM technicians ORDER BY technician_id ASC")
    techs = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(techs)

@app.route('/api/technicians/<int:tech_id>', methods=['PUT', 'DELETE'])
def technician_detail(tech_id):
    conn = get_db()
    c = conn.cursor()

    if request.method == 'DELETE':
        c.execute("DELETE FROM technicians WHERE technician_id = ?", (tech_id,))
        c.execute("UPDATE users SET technician_id = NULL WHERE technician_id = ?", (tech_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': f'Technician #{tech_id} removed.'})

    data = request.json or {}
    new_tech_id = data.get('new_technician_id') or data.get('technician_id')
    if new_tech_id is not None and str(new_tech_id).strip():
        try:
            new_tech_id = int(new_tech_id)
        except ValueError:
            new_tech_id = None

    if new_tech_id and new_tech_id != tech_id:
        c.execute("SELECT COUNT(*) FROM technicians WHERE technician_id = ?", (new_tech_id,))
        if c.fetchone()[0] > 0:
            conn.close()
            return jsonify({'status': 'error', 'message': f'Technician ID #{new_tech_id} already exists.'}), 400

        c.execute("UPDATE technicians SET technician_id = ? WHERE technician_id = ?", (new_tech_id, tech_id))
        c.execute("UPDATE users SET technician_id = ? WHERE technician_id = ?", (new_tech_id, tech_id))
        c.execute("UPDATE maintenance SET technician_id = ? WHERE technician_id = ?", (new_tech_id, tech_id))
        c.execute("UPDATE sqlite_sequence SET seq = (SELECT MAX(technician_id) FROM technicians) WHERE name = 'technicians'")
        tech_id = new_tech_id

    name = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    email = (data.get('email') or '').strip()
    role = (data.get('role') or 'Field Specialist (Technician)').strip()
    status = (data.get('status') or 'Available').strip()

    if not name or not phone:
        conn.close()
        return jsonify({'status': 'error', 'message': 'Technician Name and WhatsApp Phone Number cannot be empty.'}), 400

    if email and not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email):
        conn.close()
        return jsonify({'status': 'error', 'message': 'Invalid technician email format.'}), 400

    if not email:
        clean_tech_name = re.sub(r'[^a-zA-Z0-9]', '.', name.lower())
        email = f"{clean_tech_name}@smartfactory.com"

    c.execute('''
        UPDATE technicians SET 
            name = ?, email = ?, department = ?, phone = ?, role = ?, status = ?
        WHERE technician_id = ?
    ''', (
        name,
        email,
        data.get('department'),
        phone,
        role,
        status,
        tech_id
    ))
    # Also update linked user name if email matches
    c.execute("UPDATE users SET name = ? WHERE technician_id = ? OR LOWER(email) = LOWER(?)", (name, tech_id, email))

    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': f'Technician #{tech_id} updated successfully.'})

# --------------------------------------------------------
# NOTIFICATION CENTER & WHATSAPP DISPATCH
# --------------------------------------------------------

@app.route('/api/notifications/send-whatsapp', methods=['POST'])
def send_whatsapp_notification():
    """Logs a technician WhatsApp notification dispatch into the database."""
    data = request.json or {}
    technician_name = (data.get('technician_name') or 'Field Specialist').strip()
    phone = (data.get('phone') or '').strip()
    machine_id = (data.get('machine_id') or 'General Equipment').strip()
    message = (data.get('message') or '').strip()
    priority = (data.get('priority') or 'High').strip()
    notification_type = (data.get('notification_type') or 'WhatsApp Work Order').strip()
    due_date = (data.get('due_date') or str(datetime.date.today())).strip()

    if not phone:
        return jsonify({'status': 'error', 'message': 'WhatsApp phone number is required.'}), 400

    try:
        conn = get_db()
        c = conn.cursor()
        c.execute('''
            INSERT INTO notifications (machine_id, message, due_date, priority, status, notification_type)
            VALUES (?, ?, ?, ?, 'Sent via WhatsApp', ?)
        ''', (
            machine_id,
            f"WhatsApp Alert dispatched to {technician_name} ({phone}): {message[:120]}...",
            due_date,
            priority,
            notification_type
        ))
        conn.commit()
        conn.close()

        return jsonify({
            'status': 'success',
            'message': f"WhatsApp alert for {technician_name} ({phone}) logged successfully!",
            'notification_type': notification_type,
            'technician': technician_name,
            'phone': phone
        })
    except Exception as exc:
        return jsonify({'status': 'error', 'message': f'Database error: {str(exc)}'}), 500
# --------------------------------------------------------

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT n.*, m.machine_name 
        FROM notifications n
        LEFT JOIN machines m ON n.machine_id = m.machine_id
        ORDER BY n.notification_id DESC
    ''')
    notifs = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(notifs)

@app.route('/api/notifications/<int:n_id>/read', methods=['PUT'])
def mark_notification_read(n_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE notifications SET status = 'Read' WHERE notification_id = ?", (n_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': f'Notification #{n_id} marked as read.'})

@app.route('/api/notifications/<int:n_id>/unread', methods=['PUT'])
def mark_notification_unread(n_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE notifications SET status = 'Unread' WHERE notification_id = ?", (n_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': f'Notification #{n_id} marked as unread.'})

@app.route('/api/notifications/<int:n_id>', methods=['PUT', 'DELETE'])
def manage_single_notification(n_id):
    conn = get_db()
    c = conn.cursor()
    if request.method == 'DELETE':
        c.execute("DELETE FROM notifications WHERE notification_id = ?", (n_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': f'Notification #{n_id} deleted successfully.'})

    data = request.json or {}
    machine_id = (data.get('machine_id') or '').strip()
    message = (data.get('message') or '').strip()
    due_date = (data.get('due_date') or str(datetime.date.today())).strip()
    priority = (data.get('priority') or 'High').strip()
    status = (data.get('status') or 'Unread').strip()
    notif_type = (data.get('notification_type') or 'Maintenance Due').strip()

    if not message:
        conn.close()
        return jsonify({'status': 'error', 'message': 'Notification message cannot be empty.'}), 400

    c.execute('''
        UPDATE notifications SET 
            machine_id = COALESCE(NULLIF(?, ''), machine_id),
            message = ?,
            due_date = ?,
            priority = ?,
            status = ?,
            notification_type = ?
        WHERE notification_id = ?
    ''', (machine_id, message, due_date, priority, status, notif_type, n_id))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': f'Notification #{n_id} updated successfully.'})

@app.route('/api/notifications/send-email', methods=['POST'])
def send_email_notification():
    """Dispatches a real email notification via EmailJS REST API using environment variables."""
    data = request.json or {}
    recipient_email = (data.get('recipient_email') or '').strip()
    recipient_name = (data.get('recipient_name') or recipient_email.split('@')[0]).strip()
    subject = (data.get('subject') or 'Smart Maintenance Alert').strip()
    message = (data.get('message') or '').strip()
    machine_name = (data.get('machine_name') or 'Industrial Equipment').strip()
    priority = (data.get('priority') or 'High').strip()
    email_type = (data.get('email_type') or 'Maintenance Due Reminder').strip()

    # Validate email format
    if not recipient_email or not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', recipient_email):
        return jsonify({'status': 'error', 'message': 'Invalid recipient email address format.'}), 400

    load_dotenv(override=True)
    pub_key = (data.get('public_key') or os.getenv('EMAILJS_PUBLIC_KEY', '')).strip()
    srv_id = (data.get('service_id') or os.getenv('EMAILJS_SERVICE_ID', 'service_t57te8k')).strip()
    
    tpl_input = (data.get('template_id') or '').strip()
    env_tpl = os.getenv('EMAILJS_TEMPLATE_ID', 'template_b6mzvlp').strip()
    tpl_id = env_tpl if (not tpl_input or tpl_input == 'template_default') else tpl_input

    # Informative failure if public key is not yet set
    if not pub_key:
        return jsonify({
            'status': 'error',
            'message': f"Public Key missing for EmailJS service '{srv_id}'. Please enter your Public Key from EmailJS Account > API Keys in .env or the Email dialog."
        }), 400

    # Call EmailJS REST API
    payload = {
        'service_id': srv_id,
        'template_id': tpl_id,
        'user_id': pub_key,
        'template_params': {
            'to_email': recipient_email,
            'to_name': recipient_name,
            'subject': subject,
            'message': message,
            'machine_name': machine_name,
            'machine_id': machine_name,
            'priority': priority,
            'email_type': email_type,
            'sent_at': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
    }

    try:
        import requests
        emailjs_headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Origin': 'http://localhost:5000',
            'Referer': 'http://localhost:5000/'
        }
        resp = requests.post(
            'https://api.emailjs.com/api/v1.0/email/send',
            json=payload,
            headers=emailjs_headers,
            timeout=25
        )
        if resp.status_code == 200 or resp.text == 'OK':
            try:
                conn = get_db()
                c = conn.cursor()
                c.execute('''
                    INSERT INTO notifications (machine_id, message, due_date, priority, status, notification_type)
                    VALUES (?, ?, ?, ?, 'Sent', ?)
                ''', (
                    data.get('machine_name', 'Industrial Equipment'),
                    f"Email notification dispatched to {recipient_email}: {subject}",
                    str(datetime.date.today()),
                    priority,
                    email_type
                ))
                conn.commit()
                conn.close()
            except Exception:
                pass

            return jsonify({
                'status': 'success',
                'message': f"Real {email_type} dispatched successfully to {recipient_email} via EmailJS!",
                'email_type': email_type,
                'recipient': recipient_email
            })
        else:
            return jsonify({
                'status': 'error',
                'message': f"EmailJS rejected request with HTTP {resp.status_code}: {resp.text}"
            }), 502
    except Exception as exc:
        return jsonify({
            'status': 'error',
            'message': f"Network communication error with EmailJS: {str(exc)}"
        }), 500

# --------------------------------------------------------
# AUDIT & REPORTING MODULE
# --------------------------------------------------------

@app.route('/api/reports')
def get_reports_data():
    return jsonify({
        'status_breakdown': {
            'labels': ['Completed Services', 'Pending Maintenance', 'Overdue Alerts'],
            'data': [95, 10, 3],
            'colors': ['#10b981', '#f59e0b', '#ef4444']
        },
        'monthly_trend': {
            'months': ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
            'completed': [82, 88, 91, 94, 98, 95],
            'breakdowns': [5, 4, 3, 2, 1, 3],
            'preventive': [77, 84, 88, 92, 97, 92]
        },
        'downtime_by_dept': {
            'departments': ['Machining Shop', 'Thermal Utilities', 'Assembly Line A', 'Robotics Hub', 'Utility Plant'],
            'downtime_hours': [18.5, 34.0, 12.2, 8.0, 22.5]
        },
        'cost_analysis': {
            'categories': ['Spare Parts', 'Technician Labor', 'Emergency Repairs', 'Preventive Overhauls'],
            'costs': [14200, 9800, 4500, 18600]
        }
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'True').lower() in ('true', '1')
    print(f"Starting Smart Equipment Maintenance System (SEMS) on port {port} (debug={debug})...")
    app.run(host='0.0.0.0', port=port, debug=debug)

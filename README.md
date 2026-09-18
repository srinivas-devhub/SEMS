# Smart Equipment Maintenance System (SEMS)

[![Python](https://img.shields.io/badge/Python-3.9%2B-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.x-black.svg)](https://flask.palletsprojects.com/)
[![Database](https://img.shields.io/badge/Database-MySQL%20%7C%20SQLite-orange.svg)](https://www.mysql.com/)
[![EmailJS](https://img.shields.io/badge/EmailJS-Integrated-emerald.svg)](https://www.emailjs.com/)

An Enterprise-grade **Smart Equipment Maintenance System (SEMS)** designed for industrial operations, manufacturing plants, and facility engineering teams. SEMS delivers asset lifecycle tracking, real-time KPI health telemetry, scheduled preventive maintenance, automated technician assignment, and instant email alerts powered by EmailJS.

---

## Table of Contents
- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Installation Steps](#installation-steps)
- [Environment Variables](#environment-variables)
- [EmailJS Setup Guide](#emailjs-setup-guide)
- [Database Setup (MySQL)](#database-setup-mysql)
- [Running the Application](#running-the-application)
- [Troubleshooting & FAQs](#troubleshooting--faqs)
- [Production Readiness Checklist](#production-readiness-checklist)

---

## Project Overview

Modern industrial equipment requires proactive, reliability-centered maintenance to prevent catastrophic mechanical failure and costly production downtime. The **Smart Equipment Maintenance System (SEMS)** streamlines maintenance workflows:
- Tracks plant machinery across multiple facility departments (CNC Machining, Utilities, Robotics, Stamping).
- Automates maintenance scheduling and technician assignment.
- Dispatches real-time EmailJS notifications for upcoming and overdue maintenance.
- Provides executive analytics, downtime breakdowns, and PDF/Excel compliance reports.

---

## Key Features

1. **Executive Dashboard**: Real-time KPI summary (Total Machines, Active Assets, Upcoming Due, Overdue Alerts, Completed Services) and interactive Chart.js trend visualizations.
2. **Machine Inventory Management**: Add, edit, delete, live-search, and filter machines by department and operational status.
3. **Calendar Maintenance Scheduler**: Schedule routine, preventive, or emergency work orders with automated priority tagging and technician allocation.
4. **Engineering & Technician Roster**: Full CRUD management of plant specialists, department tracking, task load count, and direct email dispatch.
5. **Industrial Notification Center**: Real-time alert feed, unread/read state tracking, detailed modal inspection, and one-click email reminders.
6. **Triple-Type EmailJS Delivery**:
   - *Maintenance Due Reminder*
   - *Overdue Maintenance Alert*
   - *Technician Assignment Notification*
7. **Compliance & Export Suite**: One-click download of executive PDF audit reports and spreadsheet Excel (.xlsx) inventories.

---

## Prerequisites

Ensure your host machine has the following installed:
- **Python**: Version 3.9 or higher (tested on Python 3.10 – 3.14)
- **pip**: Python package manager
- **MySQL Server** (Optional for production; SQLite `sems.db` works out-of-the-box for zero-setup execution)
- **Modern Web Browser**: Google Chrome, Mozilla Firefox, Microsoft Edge, or Safari

*(Node.js is **not required** as the frontend uses modern Vanilla JavaScript, CSS3, and standard CDN libraries).*

---

## Installation Steps

### 1. Clone or Open the Repository
```bash
cd d:/TechSparta26/hack
```

### 2. Create and Activate a Python Virtual Environment (Recommended)

**On Windows (PowerShell / Command Prompt):**
```powershell
python -m venv venv
venv\Scripts\activate
```

**On Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Required Dependencies
```bash
pip install -r requirements.txt
```

The installed packages include:
- `flask`: Microframework for REST APIs and template rendering
- `flask-cors`: Cross-Origin Resource Sharing handling
- `pymysql`: Pure-Python MySQL database driver
- `python-dotenv`: Environment variable loader
- `requests`: HTTP library for EmailJS REST API dispatch

---

## Environment Variables

SEMS strictly enforces security best practices: **no sensitive keys or service IDs are hardcoded**. All keys are read from the `.env` file.

1. Copy the example configuration:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` with your preferred credentials:

```env
# ==============================================================================
# EmailJS Notification Service (Required for real email sending)
# ==============================================================================
EMAILJS_PUBLIC_KEY=your_emailjs_public_key_here
EMAILJS_SERVICE_ID=your_emailjs_service_id_here
EMAILJS_TEMPLATE_ID=your_emailjs_template_id_here

# ==============================================================================
# Database Configuration (Optional: leave blank to use default SQLite sems.db)
# ==============================================================================
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=sems_db

# ==============================================================================
# Application Settings
# ==============================================================================
FLASK_DEBUG=True
PORT=5000
SECRET_KEY=sems_production_secret_token_2026
```

---

## EmailJS Setup Guide

Follow these steps to connect your free EmailJS account and send real emails:

### Step 1: Create an EmailJS Account
1. Visit [https://www.emailjs.com/](https://www.emailjs.com/) and sign up for a free account.
2. Log into the [EmailJS Dashboard](https://dashboard.emailjs.com/).

### Step 2: Add an Email Service & Obtain `EMAILJS_SERVICE_ID`
1. Go to **Email Services** in the left sidebar.
2. Click **Add New Service** (select **Gmail**, **Outlook**, or **Personal Email**).
3. Connect your mailbox and click **Create Service**.
4. Note your **Service ID** (e.g., `service_t57te8k`). Put this into `.env` as:
   ```env
   EMAILJS_SERVICE_ID=service_t57te8k
   ```

### Step 3: Create an Email Template & Obtain `EMAILJS_TEMPLATE_ID`
1. Go to **Email Templates** in the left sidebar.
2. Click **Create New Template**.
3. In the template editor, configure:
   - **Subject**: `{{subject}}`
   - **Content / Body**:
     ```text
     Hello {{to_name}},

     {{message}}

     ---------------------------------------------
     Notification Type : {{email_type}}
     Target Equipment  : {{machine_name}}
     Priority Level    : {{priority}}
     Timestamp         : {{sent_at}}
     ---------------------------------------------

     Smart Equipment Maintenance System (SEMS)
     ```
   - In **Settings** (or To Email field on the right): set To Email to `{{to_email}}`.
4. Click **Save** and copy the **Template ID** (e.g., `template_x9y8z7w`).
5. Put this into `.env` as:
   ```env
   EMAILJS_TEMPLATE_ID=template_x9y8z7w
   ```

### Step 4: Obtain `EMAILJS_PUBLIC_KEY`
1. Click on your **Account** icon in the bottom-left or navigate to **Account > General**.
2. Under the **API Keys** section, copy your **Public Key** (e.g., `user_XXXXXXXXX` or `v8XyZ...`).
3. Put this into `.env` as:
   ```env
   EMAILJS_PUBLIC_KEY=your_public_key
   ```

*(Once saved, restart the Flask server. The status badge in the dashboard top header will turn green: `EmailJS Active`).*

---

## Database Setup (MySQL)

SEMS supports both **MySQL 8.0+** and **SQLite 3**. If MySQL is not configured, SEMS automatically initializes and runs on local SQLite `sems.db`.

To run on MySQL, open your MySQL terminal or Workbench and execute:

```sql
-- 1. Create the Database
CREATE DATABASE IF NOT EXISTS sems_db;
USE sems_db;

-- 2. Create Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Plant Manager (Admin)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Technicians Table (with email support)
CREATE TABLE IF NOT EXISTS technicians (
    technician_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'Available',
    assigned_tasks INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Machines Table
CREATE TABLE IF NOT EXISTS machines (
    machine_id VARCHAR(50) PRIMARY KEY,
    machine_name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    machine_type VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    location VARCHAR(100) NOT NULL,
    manufacturer VARCHAR(100) DEFAULT 'Siemens Industrial',
    install_date DATE NOT NULL,
    last_service_date DATE,
    next_service_date DATE,
    maintenance_interval VARCHAR(50) DEFAULT 'Monthly',
    status VARCHAR(50) DEFAULT 'Active',
    health_score INT DEFAULT 95,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create Maintenance Tasks Table
CREATE TABLE IF NOT EXISTS maintenance (
    maintenance_id INT AUTO_INCREMENT PRIMARY KEY,
    machine_id VARCHAR(50) NOT NULL,
    technician_id INT NOT NULL,
    maintenance_date DATE NOT NULL,
    priority VARCHAR(20) DEFAULT 'Medium',
    status VARCHAR(50) DEFAULT 'Pending',
    service_type VARCHAR(100) DEFAULT 'Preventive Maintenance',
    description TEXT,
    notes TEXT,
    cost DECIMAL(10, 2) DEFAULT 450.00,
    downtime_hours DECIMAL(5, 2) DEFAULT 2.5,
    completed_at DATE,
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id) ON DELETE CASCADE,
    FOREIGN KEY (technician_id) REFERENCES technicians(technician_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Create Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    machine_id VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    due_date DATE NOT NULL,
    priority VARCHAR(20) DEFAULT 'High',
    status VARCHAR(50) DEFAULT 'Unread',
    notification_type VARCHAR(50) DEFAULT 'Maintenance Due',
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Insert Default Admin Credentials
INSERT INTO users (user_id, name, email, password, role) VALUES
(1, 'Alex Mercer (Admin)', 'admin@smartfactory.com', 'admin123', 'Plant Manager (Admin)'),
(2, 'Sarah Connor', 'sarah@smartfactory.com', 'tech123', 'Senior Reliability Engineer');

-- 8. Insert Seed Technicians
INSERT INTO technicians (technician_id, name, email, department, phone, status, assigned_tasks) VALUES
(101, 'Marcus Vance', 'marcus.vance@smartfactory.com', 'Mechanical Systems', '+1 (555) 234-8901', 'Available', 3),
(102, 'Elena Rostova', 'elena.rostova@smartfactory.com', 'Electrical & Controls', '+1 (555) 345-9012', 'On Field', 5),
(103, 'David Chen', 'david.chen@smartfactory.com', 'Hydraulics & Pneumatics', '+1 (555) 456-0123', 'Available', 2);
```

---

## Running the Application

### 1. Launch the Backend Server
From the root directory:
```bash
python app.py
```
*You will see the output:*
```text
Starting Smart Equipment Maintenance System (SEMS) on port 5000 (debug=True)...
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5000
```

### 2. Access the Application in Browser
Open your browser and navigate to:
```
http://127.0.0.1:5000
```

### 3. Demo Credentials
| Role | Email | Password |
| :--- | :--- | :--- |
| **Plant Manager (Admin)** | `admin@smartfactory.com` | `admin123` |
| **Field Engineer** | `sarah@smartfactory.com` | `tech123` |

*(You can also use the **Quick Demo Profiles** buttons on the login card to log in instantly).*

---

## Troubleshooting & FAQs

### Q1: Email notification says "EmailJS credentials not configured"?
- **Cause**: The `.env` file does not contain your `EMAILJS_PUBLIC_KEY`, `EMAILJS_SERVICE_ID`, and `EMAILJS_TEMPLATE_ID`.
- **Fix**: Open `.env`, insert your EmailJS keys as shown in the [EmailJS Setup Guide](#emailjs-setup-guide), and restart the Flask app.

### Q2: Port 5000 is already in use?
- **Fix**: Change the `PORT` variable in `.env` to `5001` or `8080`:
  ```env
  PORT=5001
  ```
  Then restart `python app.py` and open `http://127.0.0.1:5001`.

### Q3: How do I switch from SQLite to MySQL?
- Provide your MySQL host, user, and password in `.env`:
  ```env
  DB_HOST=localhost
  DB_USER=root
  DB_PASSWORD=your_password
  DB_NAME=sems_db
  ```
  Run the SQL script from [Database Setup](#database-setup-mysql) and restart `app.py`.

### Q4: Emails fail with HTTP 400 from EmailJS?
- **Cause**: Your EmailJS template does not have the corresponding template parameters configured.
- **Fix**: In the EmailJS template editor, ensure the To Email field is set to `{{to_email}}` and the parameter names match `{{subject}}`, `{{message}}`, and `{{to_name}}`.

---

## Production Readiness Checklist

- [x] Architecture screen and unused diagrams completely removed from navigation, routes, and CSS.
- [x] Sensitive keys externalized to `.env` (no hardcoded credentials).
- [x] Real EmailJS dispatch integrated with RFC email validation.
- [x] All 3 email notification types supported with dedicated templates.
- [x] Duplicate email sends prevented with button disable and loading spinners.
- [x] Authentication backend `/api/login` validates credentials against users table.
- [x] Technician Management supports complete CRUD (Add, Edit, Delete, Assign).
- [x] Maintenance Scheduler supports task deletion and future date validation.
- [x] Dynamic recent activity stream connected to backend database.
- [x] Notification center supports "Mark as Read" and "View Details".
- [x] Mobile drawer navigation responsive on smartphone & tablet breakpoints.
- [x] PDF and Excel audit report generation functional.

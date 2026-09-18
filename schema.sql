-- Smart Equipment Maintenance System (SEMS) Database Schema
-- Compatible with MySQL 5.7+ / 8.0+

CREATE DATABASE IF NOT EXISTS sems_db;
USE sems_db;

-- --------------------------------------------------------
-- Table structure for Users
-- --------------------------------------------------------
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS maintenance;
DROP TABLE IF EXISTS machines;
DROP TABLE IF EXISTS technicians;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Plant Manager (Admin)',
    permissions TEXT,
    status VARCHAR(20) DEFAULT 'Active',
    technician_id INT DEFAULT NULL,
    last_login TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------
-- Table structure for Technicians
-- --------------------------------------------------------
CREATE TABLE technicians (
    technician_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    role VARCHAR(100) DEFAULT 'Field Specialist',
    status VARCHAR(50) DEFAULT 'Available',
    assigned_tasks INT DEFAULT 0,
    last_login TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------
-- Table structure for Machines
-- --------------------------------------------------------
CREATE TABLE machines (
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
    status VARCHAR(50) DEFAULT 'Active', -- Active, Under Maintenance, Breakdown, Decommissioned
    health_score INT DEFAULT 95,
    notes TEXT,
    breakdowns_count INT DEFAULT 0,
    daily_usage_hours DECIMAL(4, 1) DEFAULT 12.0,
    maintenance_interval_days INT DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------
-- Table structure for Maintenance
-- --------------------------------------------------------
CREATE TABLE maintenance (
    maintenance_id INT AUTO_INCREMENT PRIMARY KEY,
    machine_id VARCHAR(50) NOT NULL,
    technician_id INT NOT NULL,
    maintenance_date DATE NOT NULL,
    priority VARCHAR(20) DEFAULT 'Medium', -- Low, Medium, High, Critical
    status VARCHAR(50) DEFAULT 'Pending', -- Scheduled, Pending, Completed, Overdue
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

-- --------------------------------------------------------
-- Table structure for Notifications
-- --------------------------------------------------------
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    machine_id VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    due_date DATE NOT NULL,
    priority VARCHAR(20) DEFAULT 'High', -- Low, Medium, High, Critical
    status VARCHAR(50) DEFAULT 'Unread', -- Unread, Read, Sent
    notification_type VARCHAR(50) DEFAULT 'Maintenance Due', -- Maintenance Due, Overdue Alert, Critical Warning
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================
-- SEED DATA SETUP FOR DEMO (Total Machines: 150 Target Ratio)
-- ========================================================

-- Seed Users
INSERT INTO users (user_id, name, email, password, role) VALUES
(1, 'Alex Mercer', 'admin@smartfactory.com', 'admin123', 'Plant Manager'),
(2, 'Sarah Connor', 'sarah@smartfactory.com', 'tech123', 'Senior Reliability Engineer');

-- Seed Technicians
INSERT INTO technicians (technician_id, name, email, department, phone, role, status, assigned_tasks, last_login) VALUES
(101, 'Marcus Vance', 'marcus.vance@smartfactory.com', 'Mechanical Systems', '+1 (555) 234-8901', 'Lead Mechanical Engineer', 'Available', 3, '2026-09-17 08:30:00'),
(102, 'Elena Rostova', 'elena.rostova@smartfactory.com', 'Electrical & Controls', '+1 (555) 345-9012', 'Electrical Specialist', 'On Field', 5, '2026-09-16 14:15:00'),
(103, 'David Chen', 'david.chen@smartfactory.com', 'Hydraulics & Pneumatics', '+1 (555) 456-0123', 'Hydraulic Systems Specialist', 'Available', 2, '2026-09-17 11:00:00'),
(104, 'Rajesh Kumar', 'rajesh.kumar@smartfactory.com', 'Automation & Robotics', '+1 (555) 567-1234', 'Robotics Controls Specialist', 'Busy', 4, '2026-09-18 07:45:00'),
(105, 'John Miller', 'john.miller@smartfactory.com', 'HVAC & Utilities', '+1 (555) 678-2345', 'HVAC Reliability Engineer', 'Available', 1, '2026-09-15 16:20:00');

-- Seed Featured Machines
INSERT INTO machines (machine_id, machine_name, category, machine_type, department, location, manufacturer, install_date, last_service_date, next_service_date, maintenance_interval, status, health_score, notes) VALUES
('MCH-CNC-001', 'CNC Milling Station 01', 'CNC Machining', '5-Axis CNC Mill', 'Machining Shop', 'Bay A - Floor 1', 'Haas Automation', '2022-03-15', '2026-08-10', '2026-09-20', 'Monthly', 'Active', 94, 'High precision milling center running 16h shifts daily.'),
('MCH-BLR-002', 'Boiler Unit B', 'Thermal Utilities', 'High Pressure Steam Boiler', 'Utility Plant', 'Building 3 - Cell B', 'Cleaver-Brooks', '2020-06-20', '2026-06-15', '2026-09-11', 'Quarterly', 'Under Maintenance', 68, 'Requires pressure check and safety valve calibration. Overdue notice active.'),
('MCH-HYD-003', 'Hydraulic Press 500T', 'Heavy Stamping', '500-Ton Hydraulic Press', 'Assembly Line A', 'Bay C - Floor 1', 'Bosch Rexroth', '2021-11-05', '2026-07-01', '2026-09-30', 'Bi-Monthly', 'Active', 91, 'Hydraulic fluid leak inspection completed in July.'),
('MCH-ROB-004', 'Robotic Arm KUKA KR60', 'Automation', '6-Axis Articulated Robot', 'Welding Cell 2', 'Robotics Hub', 'KUKA Robotics', '2023-01-10', '2026-08-25', '2026-10-15', 'Quarterly', 'Active', 98, 'Servo motor zeroing performed recently.'),
('MCH-CMP-005', 'Rotary Air Compressor C4', 'Compressed Air', 'Rotary Screw Compressor', 'Utility Plant', 'Compressor Room 1', 'Atlas Copco', '2019-09-12', '2026-05-10', '2026-09-05', 'Monthly', 'Breakdown', 42, 'Air filter clogged and oil discharge temp high.'),
('MCH-LAT-006', 'Precision CNC Lathe L2', 'CNC Machining', 'CNC Turning Center', 'Machining Shop', 'Bay A - Floor 2', 'Mazak', '2022-08-18', '2026-08-01', '2026-10-01', 'Monthly', 'Active', 89, 'Spindle alignment verified.'),
('MCH-CON-007', 'Main Assembly Conveyor', 'Material Handling', 'Belt Conveyor Network', 'Assembly Line B', 'Main Floor', 'Hytrol', '2021-04-22', '2026-07-20', '2026-09-25', 'Monthly', 'Active', 96, 'Drive chain tensioned.'),
('MCH-HVAC-008', 'Chiller Unit HVAC-01', 'HVAC Systems', 'Industrial Centrifugal Chiller', 'Building Facilities', 'Rooftop Deck 2', 'Trane', '2018-05-30', '2026-04-10', '2026-09-15', 'Quarterly', 'Active', 85, 'Refrigerant levels nominal.');

-- Seed Maintenance Tasks
INSERT INTO maintenance (maintenance_id, machine_id, technician_id, maintenance_date, priority, status, service_type, description, notes, cost, downtime_hours, completed_at) VALUES
(1001, 'MCH-CNC-001', 101, '2026-09-20', 'High', 'Scheduled', 'Routine Lubrication & Spindle Calibration', 'Perform spindle vibration analysis, check coolant levels, grease linear guides.', 'Technician notified via SMS.', 350.00, 2.0, NULL),
(1002, 'MCH-BLR-002', 103, '2026-09-11', 'Critical', 'Overdue', 'Pressure Safety Valve Inspection', 'Annual pressure relief valve safety certification and burner combustion analysis.', 'Urgent: Overdue by 5 days.', 1200.00, 6.0, NULL),
(1003, 'MCH-CMP-005', 102, '2026-09-05', 'High', 'Pending', 'Emergency Filter Replacement', 'Replace oil separator element and flush air intake manifold.', 'Waiting for replacement filter cartridge.', 650.00, 4.5, NULL),
(1004, 'MCH-HYD-003', 104, '2026-08-15', 'Medium', 'Completed', 'Hydraulic Oil Flush & Filter Renewal', 'Flushed 400L hydraulic fluid, replaced 5-micron filter elements.', 'Operated flawlessly post-servicing.', 850.00, 3.5, '2026-08-15'),
(1005, 'MCH-ROB-004', 104, '2026-08-25', 'Low', 'Completed', 'Robot Joint Backlash & Cable Harness Check', 'Checked harness wear on joint 3 and re-greased wrist gearboxes.', 'Harness in good condition.', 400.00, 1.5, '2026-08-25');

-- Seed Notifications
INSERT INTO notifications (notification_id, machine_id, message, due_date, priority, status, notification_type) VALUES
(201, 'MCH-CNC-001', 'Maintenance Due: CNC Machine 01 requires spindle inspection.', '2026-09-20', 'High', 'Unread', 'Maintenance Due'),
(202, 'MCH-BLR-002', 'OVERDUE ALERT: Boiler Unit B maintenance is overdue by 5 days! Safety compliance risk.', '2026-09-11', 'Critical', 'Unread', 'Overdue Alert'),
(203, 'MCH-CMP-005', 'Breakdown Warning: Compressor C4 oil temperature threshold exceeded.', '2026-09-16', 'High', 'Unread', 'Critical Warning');

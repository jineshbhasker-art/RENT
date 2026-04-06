import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("rental.db");

// Initialize Database with advanced schema
db.exec(`
  CREATE TABLE IF NOT EXISTS landlords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact TEXT,
    bank_details TEXT,
    emirates_id TEXT,
    trade_license TEXT
  );

  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    type TEXT CHECK(type IN ('villa', 'apartment', 'house')) NOT NULL,
    landlord_id INTEGER,
    lease_start TEXT,
    lease_end TEXT,
    lease_amount_total REAL,
    villa_no TEXT,
    plot_no TEXT,
    makani_no TEXT,
    contract_file TEXT,
    FOREIGN KEY (landlord_id) REFERENCES landlords(id)
  );

  CREATE TABLE IF NOT EXISTS lease_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (property_id) REFERENCES properties(id)
  );

  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    unit_number TEXT NOT NULL,
    unit_type TEXT CHECK(unit_type IN ('partition', 'master_bedroom', 'full_house')) NOT NULL,
    base_rent REAL NOT NULL,
    status TEXT DEFAULT 'vacant',
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    unit_id INTEGER,
    contract_start TEXT,
    contract_end TEXT,
    contract_file TEXT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    year INTEGER NOT NULL,
    rent_amount REAL NOT NULL,
    electricity REAL DEFAULT 0,
    water REAL DEFAULT 0,
    internet REAL DEFAULT 0,
    total REAL DEFAULT 0,
    due_date TEXT,
    status TEXT DEFAULT 'unpaid',
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bill_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    payment_method TEXT,
    reference_no TEXT,
    notes TEXT,
    FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agency_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    license_no TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    bank_name TEXT,
    iban TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin'
  );

  -- Insert default agency if not exists
  INSERT OR IGNORE INTO agency_details (id, name) VALUES (1, 'Rent Professional');
  
  -- Insert default user if not exists (password: admin123)
  INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin');
`);

// Migration: Add missing columns if they don't exist (for existing databases)
const addColumn = (table: string, column: string, type: string) => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch (e) {
    // Column probably already exists
  }
};

addColumn('bills', 'paid_amount', 'REAL DEFAULT 0');
addColumn('tenants', 'is_recurring', 'INTEGER DEFAULT 0');
addColumn('landlords', 'emirates_id', 'TEXT');
addColumn('landlords', 'trade_license', 'TEXT');
addColumn('properties', 'landlord_id', 'INTEGER');
addColumn('properties', 'lease_start', 'TEXT');
addColumn('properties', 'lease_end', 'TEXT');
addColumn('properties', 'lease_amount_total', 'REAL');
addColumn('properties', 'villa_no', 'TEXT');
addColumn('properties', 'plot_no', 'TEXT');
addColumn('properties', 'makani_no', 'TEXT');
addColumn('properties', 'contract_file', 'TEXT');
addColumn('tenants', 'unit_id', 'INTEGER');
addColumn('tenants', 'contract_start', 'TEXT');
addColumn('tenants', 'contract_end', 'TEXT');
addColumn('tenants', 'contract_file', 'TEXT');
addColumn('bills', 'due_date', 'TEXT');
addColumn('bills', 'rent_amount', 'REAL');

async function startServer() {
  const app = express();
  app.use(express.json());

  // Auth
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password) as any;
    if (user) {
      res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Agency Details
  app.get("/api/agency", (req, res) => {
    res.json(db.prepare("SELECT * FROM agency_details WHERE id = 1").get());
  });

  app.put("/api/agency", (req, res) => {
    const { name, license_no, address, phone, email, logo_url, bank_name, iban } = req.body;
    db.prepare(`
      UPDATE agency_details 
      SET name = ?, license_no = ?, address = ?, phone = ?, email = ?, logo_url = ?, bank_name = ?, iban = ?
      WHERE id = 1
    `).run(name, license_no, address, phone, email, logo_url, bank_name, iban);
    res.json({ success: true });
  });

  // Reset Database
  app.post("/api/reset", (req, res) => {
    db.transaction(() => {
      db.prepare("DELETE FROM bills").run();
      db.prepare("DELETE FROM tenants").run();
      db.prepare("DELETE FROM units").run();
      db.prepare("DELETE FROM lease_payments").run();
      db.prepare("DELETE FROM properties").run();
      db.prepare("DELETE FROM landlords").run();
      // Reset sequences
      db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('bills', 'tenants', 'units', 'lease_payments', 'properties', 'landlords')").run();
    })();
    res.json({ success: true });
  });

  // Export Data
  app.get("/api/export", (req, res) => {
    const data = {
      landlords: db.prepare("SELECT * FROM landlords").all(),
      properties: db.prepare("SELECT * FROM properties").all(),
      units: db.prepare("SELECT * FROM units").all(),
      tenants: db.prepare("SELECT * FROM tenants").all(),
      bills: db.prepare("SELECT * FROM bills").all(),
      lease_payments: db.prepare("SELECT * FROM lease_payments").all(),
    };
    res.json(data);
  });

  // Import Data
  app.post("/api/import", (req, res) => {
    const data = req.body;
    try {
      db.transaction(() => {
        // Clear existing
        db.prepare("DELETE FROM bills").run();
        db.prepare("DELETE FROM tenants").run();
        db.prepare("DELETE FROM units").run();
        db.prepare("DELETE FROM lease_payments").run();
        db.prepare("DELETE FROM properties").run();
        db.prepare("DELETE FROM landlords").run();

        // Import Landlords
        const insLandlord = db.prepare("INSERT INTO landlords (id, name, contact, bank_details, emirates_id, trade_license) VALUES (?, ?, ?, ?, ?, ?)");
        data.landlords?.forEach((l: any) => insLandlord.run(l.id, l.name, l.contact, l.bank_details, l.emirates_id, l.trade_license));

        // Import Properties
        const insProperty = db.prepare("INSERT INTO properties (id, name, address, type, landlord_id, lease_start, lease_end, lease_amount_total, villa_no, plot_no, makani_no, contract_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        data.properties?.forEach((p: any) => insProperty.run(p.id, p.name, p.address, p.type, p.landlord_id, p.lease_start, p.lease_end, p.lease_amount_total, p.villa_no, p.plot_no, p.makani_no, p.contract_file));

        // Import Units
        const insUnit = db.prepare("INSERT INTO units (id, property_id, unit_number, unit_type, base_rent, status) VALUES (?, ?, ?, ?, ?, ?)");
        data.units?.forEach((u: any) => insUnit.run(u.id, u.property_id, u.unit_number, u.unit_type, u.base_rent, u.status));

        // Import Tenants
        const insTenant = db.prepare("INSERT INTO tenants (id, name, email, phone, unit_id, contract_start, contract_end, contract_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        data.tenants?.forEach((t: any) => insTenant.run(t.id, t.name, t.email, t.phone, t.unit_id, t.contract_start, t.contract_end, t.contract_file));

        // Import Bills
        const insBill = db.prepare("INSERT INTO bills (id, tenant_id, month, year, rent_amount, electricity, water, internet, total, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        data.bills?.forEach((b: any) => insBill.run(b.id, b.tenant_id, b.month, b.year, b.rent_amount, b.electricity, b.water, b.internet, b.total, b.due_date, b.status));

        // Import Lease Payments
        const insPayment = db.prepare("INSERT INTO lease_payments (id, property_id, amount, payment_date, description) VALUES (?, ?, ?, ?, ?)");
        data.lease_payments?.forEach((lp: any) => insPayment.run(lp.id, lp.property_id, lp.amount, lp.payment_date, lp.description));
      })();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Landlords
  app.get("/api/landlords", (req, res) => {
    res.json(db.prepare("SELECT * FROM landlords").all());
  });

  app.post("/api/landlords", (req, res) => {
    const { name, contact, bank_details, emirates_id, trade_license } = req.body;
    const info = db.prepare("INSERT INTO landlords (name, contact, bank_details, emirates_id, trade_license) VALUES (?, ?, ?, ?, ?)").run(name, contact, bank_details, emirates_id, trade_license);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/landlords/:id", (req, res) => {
    const { name, contact, bank_details, emirates_id, trade_license } = req.body;
    db.prepare("UPDATE landlords SET name = ?, contact = ?, bank_details = ?, emirates_id = ?, trade_license = ? WHERE id = ?").run(name, contact, bank_details, emirates_id, trade_license, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/landlords/:id", (req, res) => {
    db.prepare("DELETE FROM landlords WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Properties & Lease Tracking
  app.get("/api/properties", (req, res) => {
    const properties = db.prepare(`
      SELECT p.*, l.name as landlord_name,
      (SELECT SUM(amount) FROM lease_payments WHERE property_id = p.id) as paid_to_landlord
      FROM properties p
      LEFT JOIN landlords l ON p.landlord_id = l.id
    `).all();
    res.json(properties);
  });

  app.post("/api/properties", (req, res) => {
    const { name, address, type, landlord_id, lease_start, lease_end, lease_amount_total, villa_no, plot_no, makani_no, contract_file } = req.body;
    const info = db.prepare(`
      INSERT INTO properties (name, address, type, landlord_id, lease_start, lease_end, lease_amount_total, villa_no, plot_no, makani_no, contract_file) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, address, type, landlord_id, lease_start, lease_end, lease_amount_total, villa_no, plot_no, makani_no, contract_file);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/properties/:id", (req, res) => {
    const { name, address, type, landlord_id, lease_start, lease_end, lease_amount_total, villa_no, plot_no, makani_no, contract_file } = req.body;
    db.prepare(`
      UPDATE properties SET name = ?, address = ?, type = ?, landlord_id = ?, lease_start = ?, lease_end = ?, lease_amount_total = ?, villa_no = ?, plot_no = ?, makani_no = ?, contract_file = ?
      WHERE id = ?
    `).run(name, address, type, landlord_id, lease_start, lease_end, lease_amount_total, villa_no, plot_no, makani_no, contract_file, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/properties/:id", (req, res) => {
    db.prepare("DELETE FROM properties WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/lease-payments", (req, res) => {
    const { property_id, amount, payment_date, description } = req.body;
    const info = db.prepare("INSERT INTO lease_payments (property_id, amount, payment_date, description) VALUES (?, ?, ?, ?)").run(property_id, amount, payment_date, description);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/properties/:id/payments", (req, res) => {
    res.json(db.prepare("SELECT * FROM lease_payments WHERE property_id = ?").all(req.params.id));
  });

  // Units
  app.get("/api/units", (req, res) => {
    res.json(db.prepare("SELECT units.*, properties.name as property_name FROM units JOIN properties ON units.property_id = properties.id").all());
  });

  app.post("/api/units", (req, res) => {
    const { property_id, unit_number, unit_type, base_rent } = req.body;
    const info = db.prepare("INSERT INTO units (property_id, unit_number, unit_type, base_rent) VALUES (?, ?, ?, ?)").run(property_id, unit_number, unit_type, base_rent);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/units/:id", (req, res) => {
    const { property_id, unit_number, unit_type, base_rent, status } = req.body;
    db.prepare("UPDATE units SET property_id = ?, unit_number = ?, unit_type = ?, base_rent = ?, status = ? WHERE id = ?").run(property_id, unit_number, unit_type, base_rent, status, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/units/:id", (req, res) => {
    db.prepare("DELETE FROM units WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Tenants
  app.get("/api/tenants", (req, res) => {
    const tenants = db.prepare(`
      SELECT t.*, u.unit_number, u.unit_type, u.base_rent, p.name as property_name 
      FROM tenants t
      LEFT JOIN units u ON t.unit_id = u.id
      LEFT JOIN properties p ON u.property_id = p.id
    `).all();
    res.json(tenants);
  });

  app.post("/api/tenants", (req, res) => {
    const { name, email, phone, unit_id, contract_start, contract_end, contract_file } = req.body;
    db.transaction(() => {
      const info = db.prepare("INSERT INTO tenants (name, email, phone, unit_id, contract_start, contract_end, contract_file) VALUES (?, ?, ?, ?, ?, ?, ?)").run(name, email, phone, unit_id, contract_start, contract_end, contract_file);
      db.prepare("UPDATE units SET status = 'occupied' WHERE id = ?").run(unit_id);
      res.json({ id: info.lastInsertRowid });
    })();
  });

  app.put("/api/tenants/:id", (req, res) => {
    const { name, email, phone, unit_id, contract_start, contract_end, contract_file } = req.body;
    db.transaction(() => {
      // Get old unit_id to reset status if changed
      const oldTenant = db.prepare("SELECT unit_id FROM tenants WHERE id = ?").get(req.params.id) as { unit_id: number };
      if (oldTenant.unit_id !== unit_id) {
        db.prepare("UPDATE units SET status = 'vacant' WHERE id = ?").run(oldTenant.unit_id);
        db.prepare("UPDATE units SET status = 'occupied' WHERE id = ?").run(unit_id);
      }
      db.prepare("UPDATE tenants SET name = ?, email = ?, phone = ?, unit_id = ?, contract_start = ?, contract_end = ?, contract_file = ? WHERE id = ?").run(name, email, phone, unit_id, contract_start, contract_end, contract_file, req.params.id);
    })();
    res.json({ success: true });
  });

  app.delete("/api/tenants/:id", (req, res) => {
    db.transaction(() => {
      const tenant = db.prepare("SELECT unit_id FROM tenants WHERE id = ?").get(req.params.id) as { unit_id: number };
      if (tenant) {
        db.prepare("UPDATE units SET status = 'vacant' WHERE id = ?").run(tenant.unit_id);
      }
      db.prepare("DELETE FROM tenants WHERE id = ?").run(req.params.id);
    })();
    res.json({ success: true });
  });

  // Billing
  app.post("/api/bills/generate", (req, res) => {
    const { property_id, month, year, electricity_total, water_total, internet_total, due_date } = req.body;
    
    const tenants = db.prepare(`
      SELECT t.id, u.base_rent 
      FROM tenants t 
      JOIN units u ON t.unit_id = u.id 
      WHERE u.property_id = ?
    `).all(property_id) as { id: number, base_rent: number }[];
    
    if (tenants.length === 0) {
      return res.status(400).json({ error: "No tenants in this property" });
    }

    const count = tenants.length;
    const electricity_per = electricity_total / count;
    const water_per = water_total / count;
    const internet_per = internet_total / count;

    const insert = db.prepare(`
      INSERT INTO bills (tenant_id, month, year, rent_amount, electricity, water, internet, total, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((tenantList) => {
      for (const tenant of tenantList) {
        const total = tenant.base_rent + electricity_per + water_per + internet_per;
        insert.run(tenant.id, month, year, tenant.base_rent, electricity_per, water_per, internet_per, total, due_date);
      }
    });

    transaction(tenants);
    res.json({ success: true, count });
  });

  app.post("/api/bills/single", (req, res) => {
    const { tenant_id, month, year, rent_amount, electricity, water, internet, due_date } = req.body;
    const total = Number(rent_amount) + Number(electricity) + Number(water) + Number(internet);
    
    const info = db.prepare(`
      INSERT INTO bills (tenant_id, month, year, rent_amount, electricity, water, internet, total, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tenant_id, month, year, rent_amount, electricity, water, internet, total, due_date);
    
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/bills", (req, res) => {
    const bills = db.prepare(`
      SELECT b.*, t.name as tenant_name, t.email as tenant_email, p.name as property_name, u.unit_number
      FROM bills b
      JOIN tenants t ON b.tenant_id = t.id
      JOIN units u ON t.unit_id = u.id
      JOIN properties p ON u.property_id = p.id
      ORDER BY year DESC, month DESC
    `).all();
    res.json(bills);
  });

  app.post("/api/bills/recurring", (req, res) => {
    const { month, year, due_date } = req.body;
    
    const tenants = db.prepare(`
      SELECT t.id, u.base_rent 
      FROM tenants t 
      JOIN units u ON t.unit_id = u.id 
      WHERE t.is_recurring = 1
    `).all() as { id: number, base_rent: number }[];
    
    if (tenants.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    const insert = db.prepare(`
      INSERT INTO bills (tenant_id, month, year, rent_amount, electricity, water, internet, total, due_date)
      VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)
    `);

    let count = 0;
    db.transaction(() => {
      for (const tenant of tenants) {
        // Check if bill already exists for this tenant/month/year
        const exists = db.prepare("SELECT id FROM bills WHERE tenant_id = ? AND month = ? AND year = ?").get(tenant.id, month, year);
        if (!exists) {
          insert.run(tenant.id, month, year, tenant.base_rent, tenant.base_rent, due_date);
          count++;
        }
      }
    })();

    res.json({ success: true, count });
  });

  app.patch("/api/bills/:id/status", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE bills SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  app.get("/api/bills/:id/payments", (req, res) => {
    res.json(db.prepare("SELECT * FROM bill_payments WHERE bill_id = ? ORDER BY payment_date DESC").all(req.params.id));
  });

  app.post("/api/bills/:id/payments", (req, res) => {
    const { amount, payment_date, payment_method, reference_no, notes } = req.body;
    const billId = req.params.id;

    db.transaction(() => {
      // Insert payment
      db.prepare(`
        INSERT INTO bill_payments (bill_id, amount, payment_date, payment_method, reference_no, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(billId, amount, payment_date, payment_method, reference_no, notes);

      // Update bill paid_amount and status
      const bill = db.prepare("SELECT total, paid_amount FROM bills WHERE id = ?").get(billId) as { total: number, paid_amount: number };
      const newPaidAmount = bill.paid_amount + Number(amount);
      let newStatus = 'unpaid';
      if (newPaidAmount >= bill.total) {
        newStatus = 'paid';
      } else if (newPaidAmount > 0) {
        newStatus = 'partial';
      }

      db.prepare("UPDATE bills SET paid_amount = ?, status = ? WHERE id = ?").run(newPaidAmount, newStatus, billId);
    })();

    res.json({ success: true });
  });

  app.delete("/api/payments/:id", (req, res) => {
    const paymentId = req.params.id;
    
    db.transaction(() => {
      const payment = db.prepare("SELECT bill_id, amount FROM bill_payments WHERE id = ?").get(paymentId) as { bill_id: number, amount: number };
      if (!payment) return;

      // Delete payment
      db.prepare("DELETE FROM bill_payments WHERE id = ?").run(paymentId);

      // Update bill
      const bill = db.prepare("SELECT total, paid_amount FROM bills WHERE id = ?").get(payment.bill_id) as { total: number, paid_amount: number };
      const newPaidAmount = Math.max(0, bill.paid_amount - payment.amount);
      let newStatus = 'unpaid';
      if (newPaidAmount >= bill.total) {
        newStatus = 'paid';
      } else if (newPaidAmount > 0) {
        newStatus = 'partial';
      }

      db.prepare("UPDATE bills SET paid_amount = ?, status = ? WHERE id = ?").run(newPaidAmount, newStatus, payment.bill_id);
    })();

    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

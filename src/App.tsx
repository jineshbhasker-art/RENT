import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  ReceiptText, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  TrendingUp,
  Home,
  CreditCard,
  Search,
  Phone,
  FileText,
  Download,
  Upload,
  Cloud,
  CloudOff,
  Settings,
  History,
  PlusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, isAfter, parseISO, differenceInDays } from 'date-fns';

// Types
interface Landlord {
  id: number;
  name: string;
  contact: string;
  bank_details: string;
  emirates_id?: string;
  trade_license?: string;
}

interface Property {
  id: number;
  name: string;
  address: string;
  type: 'villa' | 'apartment' | 'house';
  landlord_id: number;
  landlord_name?: string;
  lease_start: string;
  lease_end: string;
  lease_amount_total: number;
  paid_to_landlord: number;
  villa_no?: string;
  plot_no?: string;
  makani_no?: string;
  contract_file?: string;
}

interface Unit {
  id: number;
  property_id: number;
  property_name?: string;
  unit_number: string;
  unit_type: 'partition' | 'master_bedroom' | 'full_house';
  base_rent: number;
  status: 'vacant' | 'occupied';
}

interface Tenant {
  id: number;
  name: string;
  email: string;
  phone: string;
  unit_id: number;
  unit_number?: string;
  unit_type?: string;
  base_rent?: number;
  property_name?: string;
  contract_start: string;
  contract_end: string;
  contract_file?: string;
  is_recurring: number;
}

interface Bill {
  id: number;
  tenant_id: number;
  tenant_name: string;
  tenant_email: string;
  property_name: string;
  unit_number: string;
  month: string;
  year: number;
  rent_amount: number;
  electricity: number;
  water: number;
  internet: number;
  total: number;
  paid_amount: number;
  due_date: string;
  status: 'paid' | 'unpaid' | 'partial';
}

interface BillPayment {
  id: number;
  bill_id: number;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_no: string;
  notes: string;
}

interface AgencyDetails {
  id: number;
  name: string;
  license_no: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
  bank_name: string;
  iban: string;
}

interface User {
  id: number;
  username: string;
  role: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('rent_prof_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [agency, setAgency] = useState<AgencyDetails | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'landlords' | 'properties' | 'units' | 'tenants' | 'billing' | 'settings'>('dashboard');
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showAddLandlord, setShowAddLandlord] = useState(false);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [showGenerateBill, setShowGenerateBill] = useState(false);
  const [billingMode, setBillingMode] = useState<'property' | 'tenant'>('property');
  const [preSelectedTenantId, setPreSelectedTenantId] = useState<number | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | string>('');
  const [showAddLeasePayment, setShowAddLeasePayment] = useState<{show: boolean, propertyId: number | null}>({show: false, propertyId: null});
  const [showAddBillPayment, setShowAddBillPayment] = useState<{show: boolean, bill: Bill | null}>({show: false, bill: null});
  const [showBillHistory, setShowBillHistory] = useState<{show: boolean, bill: Bill | null, payments: BillPayment[]}>({show: false, bill: null, payments: []});
  const [showContractModal, setShowContractModal] = useState<{show: boolean, tenant: Tenant | null}>({show: false, tenant: null});

  // Edit states
  const [editingLandlord, setEditingLandlord] = useState<Landlord | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  // Sync states
  const [isCloudSynced, setIsCloudSynced] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString());

  // Filter states
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>('all');
  const [landlordFilter, setLandlordFilter] = useState<string>('all');
  const [propertyStatusFilter, setPropertyStatusFilter] = useState<string>('all');
  const [expiringSoonFilter, setExpiringSoonFilter] = useState(false);

  const fetchData = async () => {
    try {
      const endpoints = ['landlords', 'properties', 'units', 'tenants', 'bills', 'agency'];
      const results = await Promise.all(endpoints.map(e => fetch(`/api/${e}`)));
      
      for (let i = 0; i < results.length; i++) {
        if (!results[i].ok) {
          const text = await results[i].text();
          console.error(`Error fetching ${endpoints[i]}: ${results[i].status}`, text);
          throw new Error(`Failed to fetch ${endpoints[i]}`);
        }
      }

      const [landlordsData, propsData, unitsData, tenantsData, billsData, agencyData] = await Promise.all(results.map(r => r.json()));

      setLandlords(landlordsData);
      setProperties(propsData);
      setUnits(unitsData);
      setTenants(tenantsData);
      setBills(billsData);
      setAgency(agencyData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      const result = await response.json();
      setUser(result.user);
      localStorage.setItem('rent_prof_user', JSON.stringify(result.user));
    } else {
      alert('Invalid credentials');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('rent_prof_user');
  };

  const fetchBillPayments = async (billId: number) => {
    const response = await fetch(`/api/bills/${billId}/payments`);
    const data = await response.json();
    return data;
  };

  const handleAddBillPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!showAddBillPayment.bill) return;
    
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    const response = await fetch(`/api/bills/${showAddBillPayment.bill.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      setShowAddBillPayment({ show: false, bill: null });
      fetchData();
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm('Delete this payment record?')) return;
    await fetch(`/api/payments/${paymentId}`, { method: 'DELETE' });
    if (showBillHistory.bill) {
      const payments = await fetchBillPayments(showBillHistory.bill.id);
      setShowBillHistory(prev => ({ ...prev, payments }));
    }
    fetchData();
  };

  const handleProcessRecurring = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    const response = await fetch('/api/bills/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      const result = await response.json();
      alert(`Successfully generated ${result.count} recurring bills.`);
      fetchData();
    }
  };

  const handleUpdateAgency = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    await fetch('/api/agency', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    fetchData();
    alert('Agency details updated');
  };

  const handleAddLandlord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      contact: formData.get('contact'),
      bank_details: formData.get('bank_details'),
      emirates_id: formData.get('emirates_id'),
      trade_license: formData.get('trade_license')
    };

    await fetch('/api/landlords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setShowAddLandlord(false);
    setEditingLandlord(null);
    fetchData();
  };

  const handleEditLandlord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingLandlord) return;
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    await fetch(`/api/landlords/${editingLandlord.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setEditingLandlord(null);
    fetchData();
  };

  const handleDeleteLandlord = async (id: number) => {
    if (!confirm('Are you sure you want to delete this landlord?')) return;
    await fetch(`/api/landlords/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleAddProperty = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      address: formData.get('address'),
      type: formData.get('type'),
      landlord_id: Number(formData.get('landlord_id')),
      lease_start: formData.get('lease_start'),
      lease_end: formData.get('lease_end'),
      lease_amount_total: Number(formData.get('lease_amount_total')),
      villa_no: formData.get('villa_no'),
      plot_no: formData.get('plot_no'),
      makani_no: formData.get('makani_no'),
      contract_file: (formData.get('contract_file') as File)?.name || ''
    };

    await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setShowAddProperty(false);
    setEditingProperty(null);
    fetchData();
  };

  const handleEditProperty = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProperty) return;
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    await fetch(`/api/properties/${editingProperty.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setEditingProperty(null);
    fetchData();
  };

  const handleDeleteProperty = async (id: number) => {
    if (!confirm('Are you sure you want to delete this property?')) return;
    await fetch(`/api/properties/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleAddLeasePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      property_id: showAddLeasePayment.propertyId,
      amount: Number(formData.get('amount')),
      payment_date: formData.get('payment_date'),
      description: formData.get('description')
    };

    await fetch('/api/lease-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setShowAddLeasePayment({show: false, propertyId: null});
    fetchData();
  };

  const handleAddUnit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      property_id: Number(formData.get('property_id')),
      unit_number: formData.get('unit_number'),
      unit_type: formData.get('unit_type'),
      base_rent: Number(formData.get('base_rent'))
    };

    await fetch('/api/units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setShowAddUnit(false);
    setEditingUnit(null);
    fetchData();
  };

  const handleEditUnit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingUnit) return;
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    await fetch(`/api/units/${editingUnit.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setEditingUnit(null);
    fetchData();
  };

  const handleDeleteUnit = async (id: number) => {
    if (!confirm('Are you sure you want to delete this unit?')) return;
    await fetch(`/api/units/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleAddTenant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      unit_id: Number(formData.get('unit_id')),
      contract_start: formData.get('contract_start'),
      contract_end: formData.get('contract_end'),
      contract_file: (formData.get('contract_file') as File)?.name || ''
    };

    await fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setShowAddTenant(false);
    setEditingTenant(null);
    fetchData();
  };

  const handleEditTenant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTenant) return;
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    await fetch(`/api/tenants/${editingTenant.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setEditingTenant(null);
    fetchData();
  };

  const handleDeleteTenant = async (id: number) => {
    if (!confirm('Are you sure you want to delete this tenant?')) return;
    await fetch(`/api/tenants/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleResetApp = async () => {
    if (!confirm('WARNING: This will delete ALL data in the database. Are you sure?')) return;
    await fetch('/api/reset', { method: 'POST' });
    fetchData();
  };

  const handleExportData = async () => {
    const response = await fetch('/api/export');
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentmaster_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!confirm('Importing will overwrite all current data. Continue?')) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      try {
        const data = JSON.parse(content);
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (response.ok) {
          alert('Data imported successfully!');
          fetchData();
        } else {
          alert('Failed to import data.');
        }
      } catch (err) {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };

  const handleSyncCloud = () => {
    setIsCloudSynced(false);
    setTimeout(() => {
      setIsCloudSynced(true);
      setLastSyncTime(new Date().toLocaleTimeString());
    }, 1500);
  };

  const handleGenerateBills = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (billingMode === 'property') {
      const data = {
        property_id: Number(formData.get('property_id')),
        month: formData.get('month'),
        year: Number(formData.get('year')),
        electricity_total: Number(formData.get('electricity')),
        water_total: Number(formData.get('water')),
        internet_total: Number(formData.get('internet')),
        due_date: formData.get('due_date')
      };

      const res = await fetch('/api/bills/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        setShowGenerateBill(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to generate bills");
      }
    } else {
      const tenantId = Number(formData.get('tenant_id'));
      const tenant = tenants.find(t => t.id === tenantId);
      const data = {
        tenant_id: tenantId,
        month: formData.get('month'),
        year: Number(formData.get('year')),
        rent_amount: Number(formData.get('rent_amount') || tenant?.base_rent || 0),
        electricity: Number(formData.get('electricity')),
        water: Number(formData.get('water')),
        internet: Number(formData.get('internet')),
        due_date: formData.get('due_date')
      };

      const res = await fetch('/api/bills/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        setShowGenerateBill(false);
        fetchData();
      } else {
        alert("Failed to generate bill");
      }
    }
  };

  const generatePDF = (bill: Bill) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text(agency?.name || 'Rent Professional', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    if (agency?.address) doc.text(agency.address, 105, 26, { align: 'center' });
    if (agency?.phone || agency?.email) doc.text(`${agency.phone || ''} | ${agency.email || ''}`, 105, 31, { align: 'center' });

    doc.setFontSize(14);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text('Official Rental Receipt & Invoice', 105, 42, { align: 'center' });
    
    // Invoice Info
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Invoice ID: #INV-${bill.id}`, 20, 55);
    doc.text(`Date: ${format(new Date(), 'dd MMM yyyy')}`, 20, 60);
    doc.text(`Due Date: ${bill.due_date ? format(parseISO(bill.due_date), 'dd MMM yyyy') : 'N/A'}`, 20, 65);
    
    // Tenant Info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', 20, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(bill.tenant_name, 20, 85);
    doc.text(bill.tenant_email, 20, 90);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Property Details:', 120, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(`Villa: ${bill.property_name}`, 120, 85);
    doc.text(`Room: Unit ${bill.unit_number}`, 120, 90);
    doc.text(`Period: ${bill.month} ${bill.year}`, 120, 95);
    
    // Table
    autoTable(doc, {
      startY: 105,
      head: [['Description', 'Amount (AED)']],
      body: [
        ['Monthly Base Rent', bill.rent_amount.toFixed(2)],
        ['Electricity Charges', bill.electricity.toFixed(2)],
        ['Water Charges', bill.water.toFixed(2)],
        ['Internet Charges', bill.internet.toFixed(2)],
      ],
      foot: [['Total Amount Due', `${bill.total.toFixed(2)} AED`]],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
      footStyles: { fillColor: [79, 70, 229] }
    });
    
    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.text('Payment Status:', 20, finalY);
    doc.setFont('helvetica', 'bold');
    const [r, g, b] = bill.status === 'paid' ? [5, 150, 105] : [220, 38, 38];
    doc.setTextColor(r, g, b);
    doc.text(bill.status.toUpperCase(), 50, finalY);
    
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Thank you for your prompt payment. For any queries, please contact management.', 105, 280, { align: 'center' });
    
    doc.save(`Invoice_${bill.tenant_name}_${bill.month}_${bill.year}.pdf`);
  };

  const generateLeaseContractPDF = (property: Property) => {
    const doc = new jsPDF();
    const landlord = landlords.find(l => l.id === property.landlord_id);
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229);
    doc.text('PROPERTY LEASE AGREEMENT', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Reference: LEASE-${property.id}-${new Date().getFullYear()}`, 105, 30, { align: 'center' });

    // Content
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('1. PARTIES', 20, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`This agreement is made between the Landlord: ${landlord?.name || 'N/A'}`, 20, 60);
    doc.text(`And the Lessee: ${agency?.name || 'Rent Professional'} (Management Company)`, 20, 70);

    doc.setFont('helvetica', 'bold');
    doc.text('2. PROPERTY DETAILS', 20, 90);
    doc.setFont('helvetica', 'normal');
    doc.text(`Property Name: ${property.name}`, 20, 100);
    doc.text(`Address: ${property.address}`, 20, 110);
    doc.text(`Villa/Apt No: ${property.villa_no || 'N/A'}`, 20, 120);
    doc.text(`Plot No: ${property.plot_no || 'N/A'}`, 20, 130);
    doc.text(`Makani No: ${property.makani_no || 'N/A'}`, 20, 140);

    doc.setFont('helvetica', 'bold');
    doc.text('3. LEASE TERMS', 20, 160);
    doc.setFont('helvetica', 'normal');
    doc.text(`Lease Period: ${property.lease_start} to ${property.lease_end}`, 20, 170);
    doc.text(`Total Lease Amount: ${(property.lease_amount_total || 0).toLocaleString()} AED`, 20, 180);

    doc.setFont('helvetica', 'bold');
    doc.text('4. GOVERNMENT COMPLIANCE', 20, 200);
    doc.setFont('helvetica', 'normal');
    doc.text('This contract is subject to UAE Real Estate Laws and Ejari registration requirements.', 20, 210);
    doc.text(`Landlord Trade License: ${landlord?.trade_license || 'N/A'}`, 20, 220);
    doc.text(`Landlord Emirates ID: ${landlord?.emirates_id || 'N/A'}`, 20, 230);

    // Signatures
    doc.text('__________________________', 40, 260);
    doc.text('Landlord Signature', 40, 270);
    doc.text('__________________________', 130, 260);
    doc.text('Lessee Signature', 130, 270);

    doc.save(`Lease_Contract_${property.name}.pdf`);
  };

  const generateRentContractPDF = (tenant: Tenant, template: string = 'standard') => {
    const doc = new jsPDF();
    const unit = units.find(u => u.id === tenant.unit_id);
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229);
    doc.text(template.toUpperCase().replace('_', ' ') + ' AGREEMENT', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Reference: RENT-${tenant.id}-${new Date().getFullYear()}`, 105, 30, { align: 'center' });

    // Content
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('1. PARTIES', 20, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`Landlord/Manager: ${agency?.name || 'Rent Professional'}`, 20, 60);
    doc.text(`Tenant: ${tenant.name}`, 20, 70);
    doc.text(`Contact: ${tenant.phone} / ${tenant.email}`, 20, 80);

    doc.setFont('helvetica', 'bold');
    doc.text('2. PREMISES', 20, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Property: ${tenant.property_name}`, 20, 110);
    doc.text(`Unit Number: ${tenant.unit_number}`, 20, 120);
    doc.text(`Unit Type: ${unit?.unit_type?.replace('_', ' ').toUpperCase() || 'N/A'}`, 20, 130);

    doc.setFont('helvetica', 'bold');
    doc.text('3. RENT & DURATION', 20, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(`Contract Period: ${tenant.contract_start} to ${tenant.contract_end}`, 20, 160);
    doc.text(`Monthly Rent: ${(unit?.base_rent || 0).toLocaleString()} AED`, 20, 170);

    if (template === 'short_term') {
      doc.setFont('helvetica', 'bold');
      doc.text('4. SHORT TERM CONDITIONS', 20, 190);
      doc.setFont('helvetica', 'normal');
      doc.text('- Security deposit is non-refundable if cancelled within 7 days.', 20, 200);
      doc.text('- Utilities are included in the monthly rent.', 20, 210);
    } else if (template === 'corporate') {
      doc.setFont('helvetica', 'bold');
      doc.text('4. CORPORATE CONDITIONS', 20, 190);
      doc.setFont('helvetica', 'normal');
      doc.text('- Agreement is between the company and the management.', 20, 200);
      doc.text('- VAT of 5% is applicable on the total rent.', 20, 210);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text('4. GENERAL CONDITIONS', 20, 190);
      doc.setFont('helvetica', 'normal');
      doc.text('1. Rent is payable in advance as per the agreed schedule.', 20, 200);
      doc.text('2. Utilities (Electricity, Water, Internet) are shared as per management policy.', 20, 210);
      doc.text('3. Maintenance of the unit is the responsibility of the tenant.', 20, 220);
    }

    // Signatures
    doc.text('__________________________', 40, 260);
    doc.text('Manager Signature', 40, 270);
    doc.text('__________________________', 130, 260);
    doc.text('Tenant Signature', 130, 270);

    doc.save(`${template}_Contract_${tenant.name}.pdf`);
  };

  const toggleBillStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    await fetch(`/api/bills/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    fetchData();
  };

  const deleteItem = async (type: 'properties' | 'tenants', id: number) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    await fetch(`/api/${type}/${id}`, { method: 'DELETE' });
    fetchData();
  };

  // Dashboard Stats
  const totalRevenue = bills.filter(b => b.status === 'paid').reduce((acc, b) => acc + b.total, 0);
  const pendingRevenue = bills.filter(b => b.status === 'unpaid').reduce((acc, b) => acc + b.total, 0);
  
  const chartData = bills.reduce((acc: any[], bill) => {
    const key = `${bill.month} ${bill.year}`;
    const existing = acc.find(i => i.name === key);
    if (existing) {
      existing.total += bill.total;
    } else {
      acc.push({ name: key, total: bill.total });
    }
    return acc;
  }, []).slice(-6);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-indigo-500/20">
              <Building2 size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Rent Professional</h1>
            <p className="text-slate-400 text-sm mt-2">Sign in to manage your portfolio</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Username</label>
              <input 
                name="username" 
                type="text" 
                required 
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
              <input 
                name="password" 
                type="password" 
                required 
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="••••••••"
              />
            </div>
            <button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-600/20 mt-4"
            >
              Sign In
            </button>
          </form>
          <p className="text-center text-slate-500 text-xs mt-8">
            Default credentials: <span className="text-slate-300">admin / admin123</span>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-2 text-indigo-600 mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Building2 size={24} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">Rent Prof.</span>
          </div>
          
          <nav className="space-y-1">
            <SidebarLink 
              icon={<LayoutDashboard size={20} />} 
              label="Dashboard" 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')} 
            />
            <SidebarLink 
              icon={<Users size={20} />} 
              label="Landlords" 
              active={activeTab === 'landlords'} 
              onClick={() => setActiveTab('landlords')} 
            />
            <SidebarLink 
              icon={<Home size={20} />} 
              label="Properties" 
              active={activeTab === 'properties'} 
              onClick={() => setActiveTab('properties')} 
            />
            <SidebarLink 
              icon={<Building2 size={20} />} 
              label="Units" 
              active={activeTab === 'units'} 
              onClick={() => setActiveTab('units')} 
            />
            <SidebarLink 
              icon={<Users size={20} />} 
              label="Tenants" 
              active={activeTab === 'tenants'} 
              onClick={() => setActiveTab('tenants')} 
            />
            <SidebarLink 
              icon={<ReceiptText size={20} />} 
              label="Billing" 
              active={activeTab === 'billing'} 
              onClick={() => setActiveTab('billing')} 
            />
            <SidebarLink 
              icon={<Settings size={20} />} 
              label="Agency Settings" 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')} 
            />
          </nav>
        </div>
        
        <div className="mt-auto p-6 border-t border-slate-100 space-y-4">
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                {user.username[0].toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold truncate">{user.username}</p>
                <p className="text-[10px] text-slate-400 capitalize">{user.role}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex justify-between items-center mb-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cloud Sync</p>
              {isCloudSynced ? (
                <Cloud className="text-emerald-500" size={14} />
              ) : (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                  <CloudOff className="text-amber-500" size={14} />
                </motion.div>
              )}
            </div>
            <p className="text-[10px] text-slate-400">Last sync: {lastSyncTime}</p>
            <button 
              onClick={handleSyncCloud}
              className="mt-2 text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
            >
              Sync Now
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={handleExportData}
              className="py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1"
            >
              <Download size={12} /> Export
            </button>
            <label className="py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1 cursor-pointer">
              <Upload size={12} /> Import
              <input type="file" className="hidden" onChange={handleImportData} accept=".json" />
            </label>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-bottom border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <h1 className="text-xl font-semibold capitalize">{activeTab}</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 w-64"
              />
            </div>
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
              JD
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard 
                    title="Total Revenue" 
                    value={`${(totalRevenue || 0).toLocaleString()} AED`} 
                    icon={<TrendingUp className="text-emerald-600" />}
                    trend="+12% from last month"
                  />
                  <StatCard 
                    title="Pending Payments" 
                    value={`${(pendingRevenue || 0).toLocaleString()} AED`} 
                    icon={<CreditCard className="text-amber-600" />}
                    trend={`${bills.filter(b => b.status === 'unpaid').length} invoices`}
                  />
                  <StatCard 
                    title="Active Tenants" 
                    value={tenants.length.toString()} 
                    icon={<Users className="text-indigo-600" />}
                    trend="Across all properties"
                  />
                </div>

                {/* Chart Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-semibold mb-6">Revenue Overview</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="total" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                    <div className="space-y-4">
                      {bills.slice(0, 5).map(bill => (
                        <div key={bill.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center",
                              bill.status === 'paid' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                            )}>
                              <ReceiptText size={20} />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{bill.tenant_name}</p>
                              <p className="text-xs text-slate-500">{bill.month} {bill.year} • {bill.property_name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-sm">{bill.total.toFixed(2)} AED</p>
                            <p className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              bill.status === 'paid' ? "text-emerald-600" : "text-amber-600"
                            )}>{bill.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'landlords' && (
              <motion.div 
                key="landlords"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Main Landlords</h2>
                  <button 
                    onClick={() => setShowAddLandlord(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                  >
                    <Plus size={20} /> Add Landlord
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {landlords.map(landlord => (
                    <div key={landlord.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-bold">{landlord.name}</h3>
                        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg">
                          <Users size={20} />
                        </div>
                      </div>
                      <div className="space-y-2 mb-4">
                        <p className="text-slate-500 text-sm flex items-center gap-2"><Phone size={14} /> {landlord.contact}</p>
                        <p className="text-slate-500 text-sm flex items-center gap-2"><CreditCard size={14} /> {landlord.bank_details}</p>
                        {landlord.emirates_id && <p className="text-slate-400 text-xs">EID: {landlord.emirates_id}</p>}
                        {landlord.trade_license && <p className="text-slate-400 text-xs">TL: {landlord.trade_license}</p>}
                      </div>
                      <div className="pt-4 border-t border-slate-100 flex gap-4">
                        <button 
                          onClick={() => setEditingLandlord(landlord)}
                          className="text-indigo-600 text-xs font-bold hover:underline"
                        >
                          Edit Details
                        </button>
                        <button 
                          onClick={() => handleDeleteLandlord(landlord.id)}
                          className="text-rose-600 text-xs font-bold hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'properties' && (
              <motion.div 
                key="properties"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <h2 className="text-2xl font-bold">Leased Portfolio</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <select 
                      value={propertyTypeFilter}
                      onChange={(e) => setPropertyTypeFilter(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Types</option>
                      <option value="villa">Villas</option>
                      <option value="apartment">Apartments</option>
                      <option value="house">Houses</option>
                    </select>

                    <select 
                      value={landlordFilter}
                      onChange={(e) => setLandlordFilter(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Landlords</option>
                      {landlords.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>

                    <select 
                      value={propertyStatusFilter}
                      onChange={(e) => setPropertyStatusFilter(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active Lease</option>
                      <option value="expired">Expired Lease</option>
                    </select>

                    <button 
                      onClick={() => setShowAddProperty(true)}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                    >
                      <Plus size={20} /> Add Property
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {properties.filter(p => {
                    const typeMatch = propertyTypeFilter === 'all' || p.type === propertyTypeFilter;
                    const landlordMatch = landlordFilter === 'all' || p.landlord_id === Number(landlordFilter);
                    
                    let statusMatch = true;
                    if (propertyStatusFilter !== 'all') {
                      const isExpired = p.lease_end && isAfter(new Date(), parseISO(p.lease_end));
                      statusMatch = propertyStatusFilter === 'active' ? !isExpired : isExpired;
                    }
                    
                    return typeMatch && landlordMatch && statusMatch;
                  }).map(property => (
                    <div key={property.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                          <Home size={24} />
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lease Progress</span>
                          <div className="w-32 h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div 
                              className="h-full bg-indigo-600" 
                              style={{ width: `${Math.min((property.paid_to_landlord / property.lease_amount_total) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <h3 className="text-lg font-bold mb-1">{property.name}</h3>
                      <p className="text-slate-500 text-sm mb-2">{property.address}</p>
                      <div className="flex gap-4 text-[10px] text-slate-400 mb-4 font-mono">
                        {property.villa_no && <span>VILLA: {property.villa_no}</span>}
                        {property.plot_no && <span>PLOT: {property.plot_no}</span>}
                        {property.makani_no && <span>MAKANI: {property.makani_no}</span>}
                        {property.contract_file && <span className="text-emerald-600 font-bold">✓ CONTRACT UPLOADED</span>}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-50 p-3 rounded-xl">
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Total Lease</p>
                          <p className="font-bold">{(property.lease_amount_total || 0).toLocaleString()} AED</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl">
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Paid to Landlord</p>
                          <p className="font-bold text-emerald-600">{(property.paid_to_landlord || 0).toLocaleString()} AED</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                        <div className="text-xs">
                          <p className="text-slate-400 uppercase font-bold">Landlord</p>
                          <p className="font-medium">{property.landlord_name}</p>
                        </div>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => generateLeaseContractPDF(property)}
                            className="text-indigo-600 text-xs font-bold hover:underline flex items-center gap-1"
                          >
                            <FileText size={14} /> Contract
                          </button>
                          <button 
                            onClick={() => setShowAddLeasePayment({show: true, propertyId: property.id})}
                            className="text-indigo-600 text-xs font-bold hover:underline"
                          >
                            Add Payment
                          </button>
                        </div>
                      </div>
                      <div className="pt-4 mt-4 border-t border-slate-100 flex gap-4">
                        <button 
                          onClick={() => setEditingProperty(property)}
                          className="text-indigo-600 text-xs font-bold hover:underline"
                        >
                          Edit Property
                        </button>
                        <button 
                          onClick={() => handleDeleteProperty(property.id)}
                          className="text-rose-600 text-xs font-bold hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'units' && (
              <motion.div 
                key="units"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Unit Management</h2>
                  <button 
                    onClick={() => setShowAddUnit(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                  >
                    <Plus size={20} /> Add Unit
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {units.map(unit => (
                    <div key={unit.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            unit.status === 'vacant' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                          )} />
                          <span className="text-xs font-bold text-slate-400">#{unit.unit_number}</span>
                        </div>
                        <span className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                          unit.status === 'vacant' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {unit.status}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 mb-1 capitalize">{unit.unit_type.replace('_', ' ')}</h4>
                      <p className="text-xs text-slate-500 mb-4">{unit.property_name}</p>
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <div className="flex gap-3">
                          <button 
                            onClick={() => setEditingUnit(unit)}
                            className="text-indigo-600 hover:text-indigo-800"
                          >
                            <FileText size={14} />
                          </button>
                          <button 
                            onClick={() => handleDeleteUnit(unit.id)}
                            className="text-rose-600 hover:text-rose-800"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-indigo-600 block">{unit.base_rent} AED</span>
                          <span className="text-[10px] text-slate-400">Monthly Rent</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'tenants' && (
              <motion.div 
                key="tenants"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold">Tenant Directory</h2>
                    <button 
                      onClick={() => setExpiringSoonFilter(!expiringSoonFilter)}
                      className={cn(
                        "px-4 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2",
                        expiringSoonFilter 
                          ? "bg-rose-50 border-rose-200 text-rose-600 shadow-sm" 
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <TrendingUp size={14} className={expiringSoonFilter ? "animate-pulse" : ""} />
                      Expiring Soon (30 Days)
                    </button>
                  </div>
                  <button 
                    onClick={() => setShowAddTenant(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                  >
                    <Plus size={20} /> Add Tenant
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tenant</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Unit / Property</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contract Period</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tenants
                        .filter(tenant => {
                          if (!expiringSoonFilter) return true;
                          if (!tenant.contract_end) return false;
                          const daysLeft = differenceInDays(parseISO(tenant.contract_end), new Date());
                          return daysLeft >= 0 && daysLeft <= 30;
                        })
                        .map(tenant => {
                          const isExpired = tenant.contract_end && isAfter(new Date(), parseISO(tenant.contract_end));
                        return (
                          <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                                  {tenant.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-medium">{tenant.name}</p>
                                  <p className="text-[10px] text-slate-400">{tenant.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-medium">Unit {tenant.unit_number}</p>
                              <p className="text-xs text-slate-500">{tenant.property_name}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-xs text-slate-600">
                                {tenant.contract_start ? format(parseISO(tenant.contract_start), 'dd MMM yyyy') : 'N/A'} - 
                                {tenant.contract_end ? format(parseISO(tenant.contract_end), 'dd MMM yyyy') : 'N/A'}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase w-fit",
                                    isExpired ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                                  )}>
                                    {isExpired ? "Expired" : "Active"}
                                  </span>
                                  <button 
                                    onClick={() => setShowContractModal({ show: true, tenant })}
                                    className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-[10px] font-bold"
                                  >
                                    <FileText size={14} /> Contract
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setBillingMode('tenant');
                                      setPreSelectedTenantId(tenant.id);
                                      setShowGenerateBill(true);
                                    }}
                                    className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1 text-[10px] font-bold"
                                  >
                                    <ReceiptText size={14} /> Bill
                                  </button>
                                </div>
                                <div className="flex gap-3 mt-1">
                                  <button 
                                    onClick={() => setEditingTenant(tenant)}
                                    className="text-indigo-600 hover:text-indigo-800 text-[10px] font-bold"
                                  >
                                    Edit
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteTenant(tenant.id)}
                                    className="text-rose-600 hover:text-rose-800 text-[10px] font-bold"
                                  >
                                    Delete
                                  </button>
                                </div>
                                {tenant.contract_file && (
                                  <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                                    <CheckCircle2 size={10} /> Contract Uploaded
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'billing' && (
              <motion.div 
                key="billing"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Billing & Invoices</h2>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        setBillingMode('property');
                        setPreSelectedTenantId(null);
                        setShowGenerateBill(true);
                      }}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                    >
                      <Plus size={20} /> Generate Bills
                    </button>
                    <button 
                      onClick={() => {
                        const month = format(new Date(), 'MMMM');
                        const year = new Date().getFullYear();
                        const dueDate = format(new Date(), 'yyyy-MM-dd');
                        if (confirm(`Process recurring bills for ${month} ${year}?`)) {
                          handleProcessRecurring({ 
                            preventDefault: () => {}, 
                            currentTarget: { 
                              entries: () => [['month', month], ['year', year], ['due_date', dueDate]] 
                            } 
                          } as any);
                        }
                      }}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                    >
                      <History size={20} /> Process Recurring
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tenant / Property</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Period</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bills.map(bill => {
                        const isOverdue = bill.status !== 'paid' && bill.due_date && isAfter(new Date(), parseISO(bill.due_date));
                        const balance = bill.total - bill.paid_amount;
                        return (
                          <tr key={bill.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-medium">{bill.tenant_name}</p>
                              <p className="text-xs text-slate-500">{bill.property_name} - Unit {bill.unit_number}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm">{bill.month} {bill.year}</p>
                              {bill.due_date && <p className={cn("text-[10px]", isOverdue ? "text-rose-600 font-bold" : "text-slate-400")}>Due: {format(parseISO(bill.due_date), 'dd MMM')}</p>}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-indigo-600">{bill.total.toFixed(2)} AED</span>
                                {bill.paid_amount > 0 && <span className="text-[10px] text-emerald-600 font-medium">Paid: {bill.paid_amount.toFixed(2)}</span>}
                                {balance > 0 && bill.paid_amount > 0 && <span className="text-[10px] text-rose-500 font-medium">Bal: {balance.toFixed(2)}</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors",
                                bill.status === 'paid' ? "bg-emerald-100 text-emerald-700" :
                                bill.status === 'partial' ? "bg-amber-100 text-amber-700" :
                                "bg-rose-100 text-rose-700"
                              )}>
                                {bill.status === 'paid' ? <CheckCircle2 size={12} /> : 
                                 bill.status === 'partial' ? <History size={12} /> : <XCircle size={12} />}
                                {bill.status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <button 
                                  onClick={() => setShowAddBillPayment({ show: true, bill })}
                                  className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1 text-[10px] font-bold"
                                  title="Add Payment"
                                >
                                  <PlusCircle size={16} /> Pay
                                </button>
                                <button 
                                  onClick={async () => {
                                    const payments = await fetchBillPayments(bill.id);
                                    setShowBillHistory({ show: true, bill, payments });
                                  }}
                                  className="text-slate-600 hover:text-slate-800 flex items-center gap-1 text-[10px] font-bold"
                                  title="Payment History"
                                >
                                  <History size={16} /> History
                                </button>
                                <button 
                                  onClick={() => generatePDF(bill)}
                                  className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-[10px] font-bold"
                                  title="Download Invoice"
                                >
                                  <ReceiptText size={16} /> PDF
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6 max-w-4xl"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Agency Settings</h2>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                  <form onSubmit={handleUpdateAgency} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input label="Agency Name" name="name" defaultValue={agency?.name} required />
                      <Input label="License Number" name="license_no" defaultValue={agency?.license_no} />
                    </div>
                    <Input label="Office Address" name="address" defaultValue={agency?.address} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input label="Contact Phone" name="phone" defaultValue={agency?.phone} />
                      <Input label="Official Email" name="email" type="email" defaultValue={agency?.email} />
                    </div>
                    <Input label="Logo URL" name="logo_url" defaultValue={agency?.logo_url} placeholder="https://..." />
                    
                    <div className="pt-6 border-t border-slate-100">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Bank Details (For Invoices)</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Bank Name" name="bank_name" defaultValue={agency?.bank_name} />
                        <Input label="IBAN" name="iban" defaultValue={agency?.iban} />
                      </div>
                    </div>

                    <div className="pt-6">
                      <button type="submit" className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                        Save Agency Profile
                      </button>
                    </div>
                  </form>
                </div>

                <div className="bg-rose-50 rounded-3xl border border-rose-100 p-8">
                  <h3 className="text-rose-900 font-bold mb-2">Danger Zone</h3>
                  <p className="text-rose-700 text-sm mb-6">These actions are irreversible. Please be careful.</p>
                  <button 
                    onClick={handleResetApp}
                    className="bg-rose-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-rose-700 transition-all"
                  >
                    Reset Entire Database
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <Modal show={!!editingLandlord} onClose={() => setEditingLandlord(null)} title="Edit Landlord">
        <form onSubmit={handleEditLandlord} className="space-y-4">
          <Input label="Landlord Name" name="name" defaultValue={editingLandlord?.name} required />
          <Input label="Contact Number" name="contact" defaultValue={editingLandlord?.contact} required />
          <Input label="Bank Details" name="bank_details" defaultValue={editingLandlord?.bank_details} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Emirates ID" name="emirates_id" defaultValue={editingLandlord?.emirates_id} />
            <Input label="Trade License" name="trade_license" defaultValue={editingLandlord?.trade_license} />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
            Update Landlord
          </button>
        </form>
      </Modal>

      <Modal show={!!editingProperty} onClose={() => setEditingProperty(null)} title="Edit Property">
        <form onSubmit={handleEditProperty} className="space-y-4">
          <Input label="Property Name" name="name" defaultValue={editingProperty?.name} required />
          <Input label="Address" name="address" defaultValue={editingProperty?.address} required />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Type</label>
              <select name="type" defaultValue={editingProperty?.type} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
                <option value="villa">Villa</option>
                <option value="apartment">Apartment</option>
                <option value="house">House</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Landlord</label>
              <select name="landlord_id" defaultValue={editingProperty?.landlord_id} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
                {landlords.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Lease Start" name="lease_start" type="date" defaultValue={editingProperty?.lease_start} required />
            <Input label="Lease End" name="lease_end" type="date" defaultValue={editingProperty?.lease_end} required />
          </div>
          <Input label="Total Lease Amount (AED)" name="lease_amount_total" type="number" defaultValue={editingProperty?.lease_amount_total} required />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Villa No" name="villa_no" defaultValue={editingProperty?.villa_no} />
            <Input label="Plot No" name="plot_no" defaultValue={editingProperty?.plot_no} />
            <Input label="Makani No" name="makani_no" defaultValue={editingProperty?.makani_no} />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
            Update Property
          </button>
        </form>
      </Modal>

      <Modal show={!!editingUnit} onClose={() => setEditingUnit(null)} title="Edit Unit">
        <form onSubmit={handleEditUnit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Property</label>
            <select name="property_id" defaultValue={editingUnit?.property_id} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Unit Number" name="unit_number" defaultValue={editingUnit?.unit_number} required />
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Unit Type</label>
              <select name="unit_type" defaultValue={editingUnit?.unit_type} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
                <option value="partition">Partition</option>
                <option value="master_bedroom">Master Bedroom</option>
                <option value="full_house">Full House</option>
              </select>
            </div>
          </div>
          <Input label="Monthly Rent (AED)" name="base_rent" type="number" defaultValue={editingUnit?.base_rent} required />
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
            <select name="status" defaultValue={editingUnit?.status} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
              <option value="vacant">Vacant</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
            Update Unit
          </button>
        </form>
      </Modal>

      <Modal show={!!editingTenant} onClose={() => setEditingTenant(null)} title="Edit Tenant">
        <form onSubmit={handleEditTenant} className="space-y-4">
          <Input label="Full Name" name="name" defaultValue={editingTenant?.name} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" name="email" type="email" defaultValue={editingTenant?.email} required />
            <Input label="Phone" name="phone" defaultValue={editingTenant?.phone} required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Assign Unit</label>
            <select name="unit_id" defaultValue={editingTenant?.unit_id} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
              {units.map(u => (
                <option key={u.id} value={u.id}>{u.property_name} - {u.unit_number} ({u.unit_type})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Contract Start" name="contract_start" type="date" defaultValue={editingTenant?.contract_start} required />
            <Input label="Contract End" name="contract_end" type="date" defaultValue={editingTenant?.contract_end} required />
          </div>
          <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl">
            <input 
              type="checkbox" 
              name="is_recurring" 
              id="edit_is_recurring" 
              className="w-4 h-4 text-indigo-600 rounded" 
              defaultChecked={editingTenant?.is_recurring === 1}
            />
            <label htmlFor="edit_is_recurring" className="text-sm font-bold text-indigo-900">Enable Recurring Monthly Billing</label>
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
            Update Tenant
          </button>
        </form>
      </Modal>

      <Modal show={showAddLandlord} onClose={() => setShowAddLandlord(false)} title="Add Main Landlord">
        <form onSubmit={handleAddLandlord} className="space-y-4">
          <Input label="Landlord Name" name="name" placeholder="e.g. Al Ghurair Properties" required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Contact Info" name="contact" placeholder="Email or Phone" required />
            <Input label="Bank Details" name="bank_details" placeholder="IBAN / Account Info" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Emirates ID" name="emirates_id" placeholder="784-XXXX-XXXXXXX-X" />
            <Input label="Trade License" name="trade_license" placeholder="License Number" />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
            Add Landlord
          </button>
        </form>
      </Modal>

      <Modal show={showAddProperty} onClose={() => setShowAddProperty(false)} title="Add Leased Property">
        <form onSubmit={handleAddProperty} className="space-y-4">
          <Input label="Property Name" name="name" placeholder="e.g. Villa 45 Jumeirah" required />
          <Input label="Address" name="address" placeholder="Dubai, UAE" required />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Villa/Apt No" name="villa_no" placeholder="e.g. 45" />
            <Input label="Plot No" name="plot_no" placeholder="e.g. 123-456" />
            <Input label="Makani No" name="makani_no" placeholder="e.g. 12345 67890" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Type</label>
              <select name="type" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="villa">Villa</option>
                <option value="apartment">Apartment</option>
                <option value="house">House</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Main Landlord</label>
              <select name="landlord_id" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
                <option value="">Select Landlord...</option>
                {landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Lease Start" name="lease_start" type="date" required />
            <Input label="Lease End" name="lease_end" type="date" required />
          </div>
          <Input label="Total Lease Amount (AED)" name="lease_amount_total" type="number" required />
          <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Upload Signed Lease Contract</label>
            <input type="file" className="text-xs text-slate-600" name="contract_file" />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
            Register Property
          </button>
        </form>
      </Modal>

      <Modal show={showAddLeasePayment.show} onClose={() => setShowAddLeasePayment({show: false, propertyId: null})} title="Add Payment to Landlord">
        <form onSubmit={handleAddLeasePayment} className="space-y-4">
          <Input label="Amount Paid (AED)" name="amount" type="number" required />
          <Input label="Payment Date" name="payment_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
          <Input label="Description" name="description" placeholder="e.g. Q1 Lease Installment" required />
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
            Record Payment
          </button>
        </form>
      </Modal>

      <Modal show={showAddUnit} onClose={() => setShowAddUnit(false)} title="Add Rental Unit / Partition">
        <form onSubmit={handleAddUnit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Property</label>
            <select name="property_id" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
              <option value="">Select Property...</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Unit / Room #" name="unit_number" placeholder="e.g. Room A" required />
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Unit Type</label>
              <select name="unit_type" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="partition">Partition Space</option>
                <option value="master_bedroom">Master Bedroom</option>
                <option value="full_house">Full House</option>
              </select>
            </div>
          </div>
          <Input label="Base Rent (AED)" name="base_rent" type="number" required />
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
            Create Unit
          </button>
        </form>
      </Modal>

      <Modal show={showAddTenant} onClose={() => setShowAddTenant(false)} title="Add New Tenant">
        <form onSubmit={handleAddTenant} className="space-y-4">
          <Input label="Full Name" name="name" placeholder="John Doe" required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" name="email" type="email" placeholder="john@example.com" required />
            <Input label="Phone" name="phone" placeholder="+971 50 123 4567" required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Assign Unit</label>
            <select name="unit_id" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
              <option value="">Select Vacant Unit...</option>
              {units.filter(u => u.status === 'vacant').map(u => (
                <option key={u.id} value={u.id}>{u.property_name} - {u.unit_number} ({u.unit_type})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Contract Start" name="contract_start" type="date" required />
            <Input label="Contract End" name="contract_end" type="date" required />
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Upload Signed Tenancy Contract</label>
            <input type="file" className="text-xs text-slate-600" name="contract_file" />
          </div>
          <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl">
            <input type="checkbox" name="is_recurring" id="is_recurring" className="w-4 h-4 text-indigo-600 rounded" />
            <label htmlFor="is_recurring" className="text-sm font-bold text-indigo-900">Enable Recurring Monthly Billing</label>
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
            Register Tenant
          </button>
        </form>
      </Modal>

      <Modal show={showGenerateBill} onClose={() => setShowGenerateBill(false)} title="Generate Monthly Bills">
        <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl">
          <button 
            onClick={() => setBillingMode('property')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              billingMode === 'property' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Property Wide (Split)
          </button>
          <button 
            onClick={() => setBillingMode('tenant')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              billingMode === 'tenant' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Specific Tenant
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-6">
          {billingMode === 'property' 
            ? "Enter total utility costs for the property. Bills will include base rent and shared utility costs."
            : "Generate a specific bill for a single tenant with custom utility amounts."}
        </p>

        <form onSubmit={handleGenerateBills} className="space-y-4">
          {billingMode === 'property' ? (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Property (Villa)</label>
              <select name="property_id" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" required>
                <option value="">Select property...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Tenant (Room)</label>
              <select 
                name="tenant_id" 
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                required
                defaultValue={preSelectedTenantId || ""}
              >
                <option value="">Select tenant...</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name} - {t.property_name} ({t.unit_number})</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Month" name="month" placeholder="e.g. October" required />
            <Input label="Year" name="year" type="number" defaultValue={new Date().getFullYear()} required />
          </div>

          {billingMode === 'tenant' && (
            <Input label="Base Rent (AED)" name="rent_amount" type="number" placeholder="Leave blank to use default" />
          )}

          <div className="grid grid-cols-3 gap-4">
            <Input label="Electricity (AED)" name="electricity" type="number" step="0.01" required />
            <Input label="Water (AED)" name="water" type="number" step="0.01" required />
            <Input label="Internet (AED)" name="internet" type="number" step="0.01" required />
          </div>
          <Input label="Due Date" name="due_date" type="date" required />
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
            {billingMode === 'property' ? "Generate & Split Bills" : "Generate Tenant Bill"}
          </button>
        </form>
      </Modal>

      <Modal show={showContractModal.show} onClose={() => setShowContractModal({show: false, tenant: null})} title="Generate Contract">
        {showContractModal.tenant && (
          <div className="space-y-6">
            <p className="text-sm text-slate-500">Select a template for <strong>{showContractModal.tenant.name}</strong>'s agreement.</p>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: 'standard', name: 'Standard Tenancy Agreement', desc: 'Default residential agreement' },
                { id: 'short_term', name: 'Short-term Rental Agreement', desc: 'For monthly or weekly stays' },
                { id: 'corporate', name: 'Corporate Lease Agreement', desc: 'For company-sponsored housing' }
              ].map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    if (showContractModal.tenant) {
                      generateRentContractPDF(showContractModal.tenant, tpl.id);
                      setShowContractModal({ show: false, tenant: null });
                    }
                  }}
                  className="flex flex-col items-start p-4 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all text-left"
                >
                  <span className="font-bold text-slate-900">{tpl.name}</span>
                  <span className="text-xs text-slate-500">{tpl.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal show={showAddBillPayment.show} onClose={() => setShowAddBillPayment({show: false, bill: null})} title="Record Bill Payment">
        {showAddBillPayment.bill && (
          <form onSubmit={handleAddBillPayment} className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl mb-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Outstanding Balance</p>
              <p className="text-2xl font-bold text-indigo-600">{(showAddBillPayment.bill.total - showAddBillPayment.bill.paid_amount).toFixed(2)} AED</p>
            </div>
            <Input label="Amount Paid (AED)" name="amount" type="number" step="0.01" defaultValue={(showAddBillPayment.bill.total - showAddBillPayment.bill.paid_amount).toFixed(2)} required />
            <Input label="Payment Date" name="payment_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Method</label>
              <select name="payment_method" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="online">Online Payment</option>
              </select>
            </div>
            <Input label="Reference / Cheque #" name="reference_no" placeholder="Optional" />
            <Input label="Notes" name="notes" placeholder="Optional" />
            <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors mt-4">
              Confirm Payment
            </button>
          </form>
        )}
      </Modal>

      <Modal show={showBillHistory.show} onClose={() => setShowBillHistory({show: false, bill: null, payments: []})} title="Payment History">
        <div className="space-y-4">
          {showBillHistory.payments.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <History size={48} className="mx-auto mb-3 opacity-20" />
              <p>No payments recorded for this bill.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {showBillHistory.payments.map(payment => (
                <div key={payment.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-900">{payment.amount.toFixed(2)} AED</p>
                    <p className="text-xs text-slate-500">{format(parseISO(payment.payment_date), 'dd MMM yyyy')} • {payment.payment_method.replace('_', ' ')}</p>
                    {payment.reference_no && <p className="text-[10px] text-indigo-600 font-medium mt-1">Ref: {payment.reference_no}</p>}
                  </div>
                  <button 
                    onClick={() => handleDeletePayment(payment.id)}
                    className="p-2 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// Helper Components
function SidebarLink({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
        active 
          ? "bg-indigo-50 text-indigo-700 shadow-sm" 
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ title, value, icon, trend }: { title: string, value: string, icon: React.ReactNode, trend: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-slate-50 rounded-xl">
          {icon}
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monthly</span>
      </div>
      <h4 className="text-slate-500 text-sm font-medium mb-1">{title}</h4>
      <p className="text-3xl font-bold mb-2">{value}</p>
      <p className="text-xs text-slate-400 font-medium">{trend}</p>
    </div>
  );
}

function Modal({ show, onClose, title, children }: { show: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle size={24} />
          </button>
        </div>
        <div className="p-8">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
      <input 
        {...props}
        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400"
      />
    </div>
  );
}

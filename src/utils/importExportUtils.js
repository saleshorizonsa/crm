import * as XLSX from 'xlsx';

// ── PRODUCT MASTER ─────────────────────────────────────────────────────────────

export const PRODUCT_TEMPLATE_COLUMNS = [
  { header: 'Item Code *',          key: 'material',             example: 'UPIP-110-4M',            note: 'Required. Unique code per company.' },
  { header: 'Item Description *',   key: 'description',          example: 'UPVC Pipe 110mm 4 Meter', note: 'Required. Full product name.' },
  { header: 'Product Group *',      key: 'material_group',       example: 'UPIP',                   note: 'Required. Must match an existing group.' },
  { header: 'Sub Group',            key: 'material_subgroup',    example: 'PRESSURE',               note: 'Optional.' },
  { header: 'Unit of Measure *',    key: 'base_unit_of_measure', example: 'PC',                     note: 'Required. PC / KG / TON / METER / SQM' },
  { header: 'Unit Price (SAR)',      key: 'unit_price',           example: '45.50',                  note: 'Optional. Numeric only.' },
  { header: 'Cost Price (SAR)',      key: 'cost_price',           example: '32.00',                  note: 'Optional. Numeric only.' },
  { header: 'Price Per Ton (SAR)',   key: 'price_per_ton',        example: '',                       note: 'Optional. Leave blank if not applicable.' },
  { header: 'Price Per PC (SAR)',    key: 'price_per_pc',         example: '45.50',                  note: 'Optional.' },
  { header: 'Price Per Meter (SAR)', key: 'price_per_meter',      example: '',                       note: 'Optional.' },
  { header: 'Is Active',            key: 'is_active',            example: 'TRUE',                   note: 'TRUE or FALSE. Default TRUE.' },
];

export function downloadProductTemplate(companyName, existingGroups = []) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Products (headers + 3 sample rows)
  const headers  = PRODUCT_TEMPLATE_COLUMNS.map(c => c.header);
  const sampleRows = [
    ['UPIP-110-4M',   'UPVC Pipe 110mm 4 Meter',         'UPIP', 'PRESSURE', 'PC',    '45.50', '32.00', '',  '45.50', '',  'TRUE'],
    ['USHT-1000-NC',  'UPVC Sheet 1000mm Natural Color',  'USHT', '',         'SQM',   '185.00','130.00','',  '',      '',  'TRUE'],
    ['DPIP-50-6M',    'UPVC Drain Pipe 50mm 6 Meter',     'DPIP', '',         'PC',    '22.75', '15.50', '',  '22.75', '',  'TRUE'],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  ws1['!cols'] = [
    {wch:20},{wch:35},{wch:15},{wch:15},{wch:18},
    {wch:16},{wch:16},{wch:16},{wch:16},{wch:18},{wch:12},
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Products');

  // Sheet 2: Instructions
  const instructions = [
    ['JASCO CRM — Product Master Import Template'],
    ['Company:', companyName],
    [''],
    ['INSTRUCTIONS'],
    ['1. Fill in the Products sheet starting from row 2'],
    ['2. Do not change or delete the header row (row 1)'],
    ['3. Delete the 3 sample rows before importing'],
    ['4. Required fields are marked with *'],
    ['5. Product Group must match an existing group in CRM'],
    ['6. Item Code must be unique within this company'],
    ['7. Is Active: enter TRUE to make product available, FALSE to hide it'],
    ['8. Save as .xlsx before uploading'],
    [''],
    ['COLUMN GUIDE'],
    ...PRODUCT_TEMPLATE_COLUMNS.map(c => [c.header, c.note, `Example: ${c.example}`]),
  ];
  if (existingGroups.length > 0) {
    instructions.push(['']);
    instructions.push([`VALID PRODUCT GROUPS FOR ${companyName.toUpperCase()}`]);
    existingGroups.forEach(g => instructions.push([g]));
  }

  const ws2 = XLSX.utils.aoa_to_sheet(instructions);
  ws2['!cols'] = [{wch:30},{wch:50},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

  XLSX.writeFile(wb, `JASCO_Product_Master_Template_${companyName.replace(/\s/g,'_')}.xlsx`);
}

// ── CUSTOMER MASTER ────────────────────────────────────────────────────────────

export const CUSTOMER_TEMPLATE_COLUMNS = [
  { header: 'Company Name *',           key: 'company_name', example: 'Namaa Building Materials', note: 'Required. Customer company name.' },
  { header: 'First Name',               key: 'first_name',   example: 'Ahmed',                   note: 'Optional. Contact person first name.' },
  { header: 'Last Name',                key: 'last_name',    example: 'Al-Rashidi',               note: 'Optional. Contact person last name.' },
  { header: 'Email',                    key: 'email',        example: 'ahmed@namaa.com',          note: 'Optional. Must be valid email format.' },
  { header: 'Phone',                    key: 'phone',        example: '+966501234567',             note: 'Optional. Include country code.' },
  { header: 'Mobile',                   key: 'mobile',       example: '+966501234567',             note: 'Optional.' },
  { header: 'City',                     key: 'city',         example: 'Jeddah',                   note: 'Optional.' },
  { header: 'Region',                   key: 'region',       example: 'Mecca',                    note: 'Optional.' },
  { header: 'Country',                  key: 'country',      example: 'Saudi Arabia',             note: 'Optional. Default: Saudi Arabia.' },
  { header: 'Industry',                 key: 'industry',     example: 'Construction',             note: 'Optional.' },
  { header: 'Assigned Salesman Email',  key: 'owner_email',  example: 'amer@jasco.com',           note: 'Optional. Must match a CRM user email.' },
  { header: 'Notes',                    key: 'notes',        example: 'Regular customer since 2020', note: 'Optional. Any relevant notes.' },
  { header: 'Status',                   key: 'status',       example: 'active',                   note: 'active or inactive. Default: active.' },
];

export function downloadCustomerTemplate(companyName, salesmen = []) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Customers
  const headers = CUSTOMER_TEMPLATE_COLUMNS.map(c => c.header);
  const sampleRows = [
    ['Namaa Building Materials', 'Ahmed', 'Al-Rashidi', 'ahmed@namaa.com',  '+966501234567', '+966501234567', 'Jeddah', 'Mecca',  'Saudi Arabia', 'Construction', 'amer@jasco.com', 'Regular customer',       'active'],
    ['Ali Al Hamdi Est.',        'Ali',   'Al Hamdi',   '',                 '',              '+966509876543', 'Jeddah', 'Mecca',  'Saudi Arabia', 'Contracting',  '',               'A-class customer',       'active'],
    ['Ghazer United Company',    '',      '',           '',                 '',              '+966555123456', 'Riyadh', 'Riyadh', 'Saudi Arabia', 'Wholesale',    'diba@jasco.com', '',                       'active'],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  ws1['!cols'] = [
    {wch:30},{wch:15},{wch:15},{wch:28},{wch:18},{wch:18},
    {wch:15},{wch:15},{wch:15},{wch:18},{wch:25},{wch:30},{wch:12},
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Customers');

  // Sheet 2: Instructions
  const instructions = [
    ['JASCO CRM — Customer Master Import Template'],
    ['Company:', companyName],
    [''],
    ['INSTRUCTIONS'],
    ['1. Fill in the Customers sheet starting from row 2'],
    ['2. Do not change or delete the header row (row 1)'],
    ['3. Delete the 3 sample rows before importing'],
    ['4. Required fields are marked with *'],
    ['5. Assigned Salesman Email must match a user in CRM'],
    ['6. Company Name must be unique — duplicates will be updated'],
    ['7. Save as .xlsx before uploading'],
    [''],
    ['COLUMN GUIDE'],
    ...CUSTOMER_TEMPLATE_COLUMNS.map(c => [c.header, c.note, `Example: ${c.example}`]),
  ];
  if (salesmen.length > 0) {
    instructions.push(['']);
    instructions.push([`SALESMEN IN ${companyName.toUpperCase()}`]);
    salesmen.forEach(s => instructions.push([s.full_name, s.email]));
  }

  const ws2 = XLSX.utils.aoa_to_sheet(instructions);
  ws2['!cols'] = [{wch:30},{wch:50},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

  XLSX.writeFile(wb, `JASCO_Customer_Master_Template_${companyName.replace(/\s/g,'_')}.xlsx`);
}

// ── IMPORT PARSERS ─────────────────────────────────────────────────────────────

export function parseProductFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'binary' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });

        const products = rows.map((row, i) => ({
          rowNum:              i + 2,
          material:            (row['Item Code *']          || row['Item Code']          || '').trim(),
          description:         (row['Item Description *']   || row['Item Description']   || '').trim(),
          material_group:      (row['Product Group *']      || row['Product Group']      || '').trim().toUpperCase(),
          material_subgroup:   (row['Sub Group']            || '').trim(),
          base_unit_of_measure:(row['Unit of Measure *']    || row['Unit of Measure']    || 'PC').trim().toUpperCase(),
          unit_price:          parseFloat(row['Unit Price (SAR)'])       || null,
          cost_price:          parseFloat(row['Cost Price (SAR)'])       || null,
          price_per_ton:       parseFloat(row['Price Per Ton (SAR)'])    || null,
          price_per_pc:        parseFloat(row['Price Per PC (SAR)'])     || null,
          price_per_meter:     parseFloat(row['Price Per Meter (SAR)'])  || null,
          is_active:           String(row['Is Active'] || 'TRUE').toUpperCase() !== 'FALSE',
        }));

        resolve(products);
      } catch(err) {
        reject(new Error('Could not read file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsBinaryString(file);
  });
}

export function parseCustomerFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'binary' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });

        const customers = rows.map((row, i) => ({
          rowNum:       i + 2,
          company_name: (row['Company Name *'] || row['Company Name'] || '').trim(),
          first_name:   (row['First Name']     || '').trim(),
          last_name:    (row['Last Name']      || '').trim(),
          email:        (row['Email']          || '').trim().toLowerCase(),
          phone:        (row['Phone']          || '').trim(),
          mobile:       (row['Mobile']         || '').trim(),
          city:         (row['City']           || '').trim(),
          region:       (row['Region']         || '').trim(),
          country:      (row['Country']        || 'Saudi Arabia').trim(),
          industry:     (row['Industry']       || '').trim(),
          owner_email:  (row['Assigned Salesman Email'] || '').trim().toLowerCase(),
          notes:        (row['Notes']          || '').trim(),
          status:       (row['Status']         || 'active').trim().toLowerCase(),
        }));

        resolve(customers);
      } catch(err) {
        reject(new Error('Could not read file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsBinaryString(file);
  });
}

// ── VALIDATORS ─────────────────────────────────────────────────────────────────

export function validateProductRows(rows, validGroups = []) {
  const errors   = [];
  const warnings = [];
  const valid    = [];
  const seenCodes = new Set();

  rows.forEach(row => {
    const rowErrors = [];

    if (!row.material) {
      rowErrors.push('Item Code is required');
    } else if (seenCodes.has(row.material.toLowerCase())) {
      rowErrors.push(`Duplicate Item Code: ${row.material}`);
    } else {
      seenCodes.add(row.material.toLowerCase());
    }

    if (!row.description) rowErrors.push('Item Description is required');

    if (!row.material_group) {
      rowErrors.push('Product Group is required');
    } else if (
      validGroups.length > 0 &&
      !validGroups.map(g => g.toUpperCase()).includes(row.material_group.toUpperCase())
    ) {
      warnings.push({ row: row.rowNum, message: `Group "${row.material_group}" not found — will be created` });
    }

    if (!row.base_unit_of_measure) rowErrors.push('Unit of Measure is required');

    if (rowErrors.length > 0) {
      errors.push({ row: row.rowNum, messages: rowErrors, data: row });
    } else {
      valid.push(row);
    }
  });

  return { valid, errors, warnings };
}

export function validateCustomerRows(rows) {
  const errors   = [];
  const warnings = [];
  const valid    = [];
  const seenNames = new Set();

  rows.forEach(row => {
    const rowErrors = [];

    if (!row.company_name) {
      rowErrors.push('Company Name is required');
    } else if (seenNames.has(row.company_name.toLowerCase())) {
      rowErrors.push(`Duplicate: ${row.company_name}`);
    } else {
      seenNames.add(row.company_name.toLowerCase());
    }

    if (row.email && !row.email.includes('@')) {
      rowErrors.push(`Invalid email: ${row.email}`);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: row.rowNum, messages: rowErrors, data: row });
    } else {
      valid.push(row);
    }
  });

  return { valid, errors, warnings };
}

// ── EXPORT CURRENT DATA ────────────────────────────────────────────────────────

export function exportProductsToExcel(products, companyName) {
  const rows = products.map(p => ({
    'Item Code *':           p.material              || '',
    'Item Description *':    p.description           || '',
    'Product Group *':       p.material_group        || '',
    'Sub Group':             p.material_subgroup     || '',
    'Unit of Measure *':     p.base_unit_of_measure  || '',
    'Unit Price (SAR)':      p.unit_price            || '',
    'Cost Price (SAR)':      p.cost_price            || '',
    'Price Per Ton (SAR)':   p.price_per_ton         || '',
    'Price Per PC (SAR)':    p.price_per_pc          || '',
    'Price Per Meter (SAR)': p.price_per_meter       || '',
    'Is Active':             p.is_active ? 'TRUE' : 'FALSE',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    {wch:20},{wch:35},{wch:15},{wch:15},{wch:18},
    {wch:16},{wch:16},{wch:16},{wch:16},{wch:18},{wch:12},
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  XLSX.writeFile(wb, `JASCO_Products_${companyName.replace(/\s/g,'_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportCustomersToExcel(customers, companyName) {
  const rows = customers.map(c => ({
    'Company Name *':          c.company_name || '',
    'First Name':              c.first_name   || '',
    'Last Name':               c.last_name    || '',
    'Email':                   c.email        || '',
    'Phone':                   c.phone        || '',
    'Mobile':                  c.mobile       || '',
    'City':                    c.city         || '',
    'Region':                  c.region       || '',
    'Country':                 c.country      || '',
    'Industry':                c.industry     || '',
    'Assigned Salesman Email': c.owner?.email || '',
    'Notes':                   c.notes        || '',
    'Status':                  c.status       || 'active',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    {wch:30},{wch:15},{wch:15},{wch:28},{wch:18},{wch:18},
    {wch:15},{wch:15},{wch:15},{wch:18},{wch:25},{wch:30},{wch:12},
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  XLSX.writeFile(wb, `JASCO_Customers_${companyName.replace(/\s/g,'_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

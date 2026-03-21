const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'components/Finance.tsx');
let content = fs.readFileSync(file, 'utf8');
let changes = 0;

// Update Table Headers
const theadRegex = /<th className="px-6 py-4">Aluno \/ Descrição<\/th>/g;
const newThead = `<th className="px-6 py-4 w-12 text-center">
  <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500" 
    checked={selectedPayments.length > 0 && selectedPayments.length === filteredPayments.filter(p=>p.status !== 'paid').length}
    onChange={(e) => setSelectedPayments(e.target.checked ? filteredPayments.filter(p=>p.status !== 'paid').map(p=>p.id) : [])}
  />
</th>
<th className="px-6 py-4">Aluno / Descrição</th>`;

if (content.match(theadRegex)) {
  content = content.replace(theadRegex, newThead);
  changes++;
}

// Update Single Payment Rows (in the else block/map)
// Find the exact mapping part for flat payments. 
// It's probably something like: {isExpanded && group.payments.map(payment => (
// And for flat: {!grouped && filteredPayments.map(payment => (
// To be safe, we'll find <td className="px-6 py-4"> which precedes the avatar div.
const tdRegex = /<td className="px-6 py-4">\s*<div className="flex items-center gap-4">/g;
const newTd = `<td className="px-6 py-4 w-12 text-center">
  <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
    disabled={payment.status === 'paid'}
    checked={selectedPayments.includes(payment.id)}
    onChange={(e) => setSelectedPayments(prev => e.target.checked ? [...prev, payment.id] : prev.filter(id => id !== payment.id))}
  />
</td>
<td className="px-6 py-4">
  <div className="flex items-center gap-4">`;

if (content.match(tdRegex)) {
  content = content.replace(tdRegex, newTd);
  changes++;
}

// Inject the bulk action button above the table
const tabsNav = `<div className="flex bg-slate-100/50 p-1.5 rounded-xl self-start overflow-x-auto w-full md:w-auto">`;
const bulkBtn = `<div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
  {selectedPayments.length > 0 && (
    <button onClick={() => handleBulkDelete(selectedPayments)} disabled={isDeleting} className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-sm border border-red-100 hover:bg-red-100 items-center justify-center flex gap-2 transition-all shrink-0">
      <Trash2 size={16} /> Excluir {selectedPayments.length} selecionados
    </button>
  )}
  ${tabsNav}`;

if (content.includes(tabsNav) && !content.includes("Excluir {selectedPayments.length} selecionados")) {
  // Only replace the first occurrence which is the toolbar
  content = content.replace(tabsNav, bulkBtn);
  content = content.replace(`{/* Main Content */}`, `{/* Main Content */}\n</div>`); // Close the flex div that we just wrapped around tabsNav, or better, let's just use empty fragment instead of opening a flex wrapper if we aren't closing it!
  changes++;
}

// Wait, the tabsNav wrapping was problematic with open divs. Let's fix that!
const betterBulk = `{selectedPayments.length > 0 && (
  <button onClick={() => handleBulkDelete(selectedPayments)} disabled={isDeleting} className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-sm border border-red-100 hover:bg-red-100 items-center justify-center flex gap-2 transition-all shrink-0">
    <Trash2 size={16} /> Excluir {selectedPayments.length} selecionados
  </button>
)}
${tabsNav}`;

// Revert previous attempt and use better Bulk
content = content.replace(bulkBtn, betterBulk);

if (changes > 0) {
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully injected checkboxes. Total changes:', changes);
} else {
  console.log('No matches found for injection.');
}

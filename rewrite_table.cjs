const fs = require('fs');

const file = 'components/Finance.tsx';
let content = fs.readFileSync(file, 'utf8');

// ===============================================================
// Step 1: Replace the table tag itself to use table-fixed
// ===============================================================
content = content.replace(
  '<table className="w-full text-left table-fixed">',
  '<table className="w-full text-left">'
);
content = content.replace(
  '<table className="w-full text-left">',
  '<table className="w-full text-left table-auto">'
);

// ===============================================================
// Step 2: Fully replace the header row with clean, aligned cols
// ===============================================================
const oldHeader = `            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black tracking-[0.1em]">
              <tr>
                <th className="px-6 py-4 w-12 text-center">
  {filterType !== 'parcelamentos' && <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500" 
    checked={selectedPayments.length > 0 && selectedPayments.length === filteredPayments.filter(p=>p.status !== 'paid').length}
    onChange={(e) => setSelectedPayments(e.target.checked ? filteredPayments.filter(p=>p.status !== 'paid').map(p=>p.asaasPaymentId || p.id) : [])}
  />
  }
</th>
<th className="px-6 py-4 whitespace-nowrap min-w-[200px]">Aluno / Descrição</th>
                <th className="px-6 py-4">Vencimento</th>
                <th className="px-6 py-4">Valor</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ação</th>
              </tr>
            </thead>`;

const newHeader = `            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black tracking-[0.1em]">
              <tr>
                <th className="w-12 px-4 py-4 text-center">
                  {filterType !== 'parcelamentos' && (
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={selectedPayments.length > 0 && selectedPayments.length === filteredPayments.filter(p => p.status !== 'paid').length}
                      onChange={e => setSelectedPayments(e.target.checked ? filteredPayments.filter(p => p.status !== 'paid').map(p => p.asaasPaymentId || p.id) : [])}
                    />
                  )}
                </th>
                <th className="px-4 py-4">Aluno / Descri\u00e7\u00e3o</th>
                <th className="px-4 py-4">Vencimento</th>
                <th className="px-4 py-4">Valor</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-right">A\u00e7\u00e3o</th>
              </tr>
            </thead>`;

if (content.includes(oldHeader)) {
  content = content.replace(oldHeader, newHeader);
  console.log('Header replaced OK');
} else {
  console.log('Header NOT found, trying partial replace...');
  // Try just finding the th elements block
  const idx = content.indexOf('<th className="px-6 py-4 w-12 text-center">');
  if (idx !== -1) {
    const endIdx = content.indexOf('</thead>', idx) + '</thead>'.length;
    const theadBlock = content.substring(content.lastIndexOf('<thead', idx), endIdx);
    content = content.replace(theadBlock, newHeader);
    console.log('Header replaced via indexOf');
  }
}

// ===============================================================
// Step 3: rewrite the flat list rows to include checkboxes
// ===============================================================
// Find the flat list section (filteredPayments.map) and rewrite it entirely
const flatListStart = content.indexOf("filteredPayments.map(payment => {\n                  const student = data.students.find(s => s.id === payment.studentId);");
const flatListEnd = content.indexOf("});\n              )}\n              {((filterType === 'parcelamentos'");

if (flatListStart !== -1 && flatListEnd !== -1) {
  const newFlatList = `filteredPayments.map(payment => {
                  const student = data.students.find(s => s.id === payment.studentId);
                  const payId = payment.asaasPaymentId || payment.id;
                  return (
                    <tr key={payment.id} className="hover:bg-indigo-50/30 transition-colors group bg-white">
                      <td className="w-12 px-4 py-5 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                          disabled={payment.status === 'paid'}
                          checked={selectedPayments.includes(payId)}
                          onChange={e => setSelectedPayments(prev =>
                            e.target.checked ? [...prev, payId] : prev.filter(x => x !== payId)
                          )}
                        />
                      </td>
                      <td className="px-4 py-5">
                        <div className="font-bold text-slate-900 flex items-center gap-1 max-w-[240px] truncate">
                          <span className="truncate">{student?.name || 'Aluno Removido'}</span>
                          <button onClick={() => student && openHistory(student.id)} className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0" title="Ver Hist\u00f3rico">
                            <Eye size={13} />
                          </button>
                        </div>
                        <div className="text-[10px] font-black text-indigo-500 uppercase tracking-wide mt-0.5">
                          {payment.type === 'registration' ? 'Matr\u00edcula' : 'Mensalidade'}
                          {payment.installmentNumber && <span> {payment.installmentNumber}/{payment.totalInstallments}</span>}
                        </div>
                        {payment.description && <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[240px]">{payment.description}</div>}
                      </td>
                      <td className="px-4 py-5 text-slate-600 text-sm">
                        {new Date(payment.dueDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-5">
                        <div className="font-black text-slate-900 text-sm">R$ {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        {!!payment.discount && payment.discount > 0 && (
                          <div className="text-[10px] text-emerald-600 font-bold">- R$ {payment.discount.toFixed(2)}</div>
                        )}
                      </td>
                      <td className="px-4 py-5">{getStatusBadge(payment)}</td>
                      <td className="px-4 py-5">
                        <div className="flex justify-end gap-1 flex-wrap items-center">
                          {payment.asaasPaymentId && (
                            <>
                              {(payment.status === 'pending' || payment.status === 'overdue') && (
                                <button onClick={() => handleOpenPaymentLink(payment.asaasPaymentId!, 'boleto')} className="px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors inline-flex items-center gap-1">
                                  <Barcode size={13} /> Boleto
                                </button>
                              )}
                              {(payment.status === 'paid' || payment.status === 'received' || payment.status === 'confirmed') && (
                                <button onClick={() => handleOpenPaymentLink(payment.asaasPaymentId!, 'recibo')} className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors inline-flex items-center gap-1 border border-emerald-100">
                                  <Receipt size={13} /> Recibo
                                </button>
                              )}
                            </>
                          )}
                          <button onClick={() => { setPaymentToEdit(payment); setEditValue(payment.amount.toString()); setEditDate(payment.dueDate); }} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-all" title="Editar">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => openDelete(payment)} className="p-1.5 text-slate-400 hover:text-red-600 transition-all" title="Excluir">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })`;

  content = content.substring(0, flatListStart) + newFlatList + content.substring(flatListEnd);
  console.log('Flat list replaced OK');
} else {
  console.log('Could not find flat list section. Start:', flatListStart, 'End:', flatListEnd);
}

// ===============================================================
// Step 4: rewrite inner carné expanded rows to include checkboxes
// ===============================================================
const carneRowStart = content.indexOf('{isExpanded && group.payments.map(payment => (');
const carneRowEnd = content.indexOf('))}', carneRowStart) + 3;

if (carneRowStart !== -1 && carneRowEnd > 3) {
  const newCarneRow = `{isExpanded && group.payments.map(payment => {
                        const payId = payment.asaasPaymentId || payment.id;
                        return (
                        <tr key={payment.id} className="hover:bg-indigo-50/10 transition-colors bg-white border-t border-slate-50">
                          <td className="w-12 px-4 py-4 text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                              disabled={payment.status === 'paid'}
                              checked={selectedPayments.includes(payId)}
                              onChange={e => setSelectedPayments(prev =>
                                e.target.checked ? [...prev, payId] : prev.filter(x => x !== payId)
                              )}
                            />
                          </td>
                          <td className="px-4 py-4 pl-8">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                              Parcela {payment.installmentNumber}/{payment.totalInstallments}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-slate-600 text-sm">
                            {new Date(payment.dueDate).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-bold text-slate-700 text-sm">R$ {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          </td>
                          <td className="px-4 py-4">{getStatusBadge(payment)}</td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-1 flex-wrap">
                              {payment.asaasPaymentId && (
                                <>
                                  {(payment.status === 'pending' || payment.status === 'overdue') && (
                                    <button onClick={() => handleOpenPaymentLink(payment.asaasPaymentId!, 'boleto')} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-[10px] font-bold hover:bg-slate-200 inline-flex items-center gap-1">
                                      <Barcode size={11} /> Boleto
                                    </button>
                                  )}
                                  {(payment.status === 'paid' || payment.status === 'received' || payment.status === 'confirmed') && (
                                    <button onClick={() => handleOpenPaymentLink(payment.asaasPaymentId!, 'recibo')} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold hover:bg-emerald-100 inline-flex items-center gap-1">
                                      <Receipt size={11} /> Recibo
                                    </button>
                                  )}
                                </>
                              )}
                              <button onClick={() => { setPaymentToEdit(payment); setEditValue(payment.amount.toString()); setEditDate(payment.dueDate); }} className="p-1 text-slate-400 hover:text-indigo-600" title="Editar">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => openDelete(payment)} className="p-1 text-slate-400 hover:text-red-600" title="Excluir">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}`;
  content = content.substring(0, carneRowStart) + newCarneRow + content.substring(carneRowEnd);
  console.log('Carné expanded rows replaced OK');
} else {
  console.log('Could not find carné expanded rows. Start:', carneRowStart, 'End:', carneRowEnd);
}

// ===============================================================
// Step 5: Fix carné group header row to have same 6 columns
// ===============================================================
const carneGroupTrStart = content.indexOf('<tr className="hover:bg-indigo-50/30 transition-colors group bg-slate-50/50">');
const carneGroupTrEnd = content.indexOf('</tr>\n                       {isExpanded');
if (carneGroupTrStart !== -1 && carneGroupTrEnd !== -1) {
  const newGroupRow = `<tr className="hover:bg-indigo-50/30 transition-colors group bg-slate-50/50">
                        <td className="w-12 px-4 py-5"></td>
                        <td className="px-4 py-5">
                          <div className="font-bold text-slate-900">{student?.name || 'Aluno Removido'}</div>
                          <div className="text-[10px] font-black text-indigo-500 uppercase tracking-wide mt-1 flex items-center gap-1">
                            <Layers size={12} /> Carn\u00ea de {group.payments.length}x
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">{group.description}</div>
                        </td>
                        <td className="px-4 py-5 text-slate-500 text-xs">
                          {group.payments.length > 0 && (
                            <>
                              <span className="block">In\u00edcio: {new Date(group.payments[0].dueDate).toLocaleDateString('pt-BR')}</span>
                              <span className="block">Fim: {new Date(group.payments[group.payments.length - 1].dueDate).toLocaleDateString('pt-BR')}</span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-5">
                          <div className="font-black text-slate-900 text-sm">R$ {group.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          <div className="text-[10px] text-slate-400">Total do Carn\u00ea</div>
                        </td>
                        <td className="px-4 py-5">
                          <span className="inline-flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase">
                            <Layers size={11}/> {group.payments.length} Parcelas
                          </span>
                        </td>
                        <td className="px-4 py-5">
                          <div className="flex justify-end gap-1.5 flex-wrap">
                            <button onClick={() => toggleInstallment(group.installmentId)} className="px-2.5 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold hover:bg-slate-50 transition-colors inline-flex items-center gap-1">
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              {isExpanded ? 'Ocultar' : 'Ver Parcelas'}
                            </button>
                            <button onClick={() => handleOpenPaymentLink(group.installmentId, 'carne')} className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-bold hover:bg-indigo-100 transition-colors inline-flex items-center gap-1 border border-indigo-100">
                              <Printer size={11} /> Imprimir Carn\u00ea
                            </button>
                            <button onClick={() => { setCarneToDelete(group); setCarneSelectedPayments(group.payments.filter(p => p.status !== 'paid').map(p => p.asaasPaymentId || p.id)); }} className="p-1.5 text-slate-400 hover:text-red-600 transition-all" title="Excluir Carn\u00ea">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>`;
  const oldGroupTrBlock = content.substring(carneGroupTrStart, carneGroupTrEnd + 5);
  content = content.replace(oldGroupTrBlock, newGroupRow);
  console.log('Carné group row replaced OK');
}

// ===============================================================
// Step 6: Make sure Pencil is imported
// ===============================================================
if (!content.includes('Pencil,') && !content.includes('Pencil }')) {
  content = content.replace(
    "import { Trash2,",
    "import { Trash2, Pencil,"
  );
  console.log('Pencil icon imported');
}

fs.writeFileSync(file, content, 'utf8');
console.log('\nAll done!');

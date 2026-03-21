const fs = require('fs');

const file = 'components/Finance.tsx';
let content = fs.readFileSync(file, 'utf8');

// Find the flat list section precisely
const flatStart = content.indexOf('filteredPayments.map(payment => {\r\n                  const student = data.students.find(s => s.id === payment.studentId);\r\n                  return (\r\n                    <tr key={payment.id}');
// Alternative with LF
const flatStartLF = content.indexOf('filteredPayments.map(payment => {\n                  const student = data.students.find(s => s.id === payment.studentId);\n                  return (\n                    <tr key={payment.id}');

const actualStart = flatStart !== -1 ? flatStart : flatStartLF;
console.log('Flat list start:', actualStart);

if (actualStart === -1) {
  console.error('Cannot find flat list start');
  process.exit(1);
}

// Find end of the flat list: the closing }) that ends the map
const afterFlatStart = content.indexOf("});\n              )}\n              {((filterType", actualStart);
const afterFlatStartLF = content.indexOf("})\n              )}\n              {((filterType", actualStart);
const flatEnd = afterFlatStart !== -1 ? afterFlatStart + 3 : afterFlatStartLF + 2;
console.log('Flat list end:', flatEnd);

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
                        <div className="font-bold text-slate-900 flex items-center gap-1 max-w-[240px]">
                          <span className="truncate">{student?.name || 'Aluno Removido'}</span>
                          <button onClick={() => student && openHistory(student.id)} className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0" title="Ver Hist\xf3rico">
                            <Eye size={13} />
                          </button>
                        </div>
                        <div className="text-[10px] font-black text-indigo-500 uppercase tracking-wide mt-0.5">
                          {payment.type === 'registration' ? 'Matr\xedcula' : 'Mensalidade'}
                          {payment.installmentNumber && <span> {payment.installmentNumber}/{payment.totalInstallments}</span>}
                        </div>
                        {payment.description && <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[230px]">{payment.description}</div>}
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

// Find where the map ends properly - its the last }) before )} {((filterType
const mapEndSearch = content.substring(actualStart, actualStart + 3000);
const endIdx = mapEndSearch.lastIndexOf('})\n              )}');
const mapEnd2 = mapEndSearch.lastIndexOf('})\r\n              )}');
const useEnd = Math.max(endIdx, mapEnd2);
const fullEnd = actualStart + useEnd + 2; // just the }) part
console.log('useEnd offset:', useEnd, 'fullEnd:', fullEnd);

if (useEnd !== -1) {
  content = content.substring(0, actualStart) + newFlatList + content.substring(fullEnd);
  console.log('Flat list rewrite SUCCESS');
} else {
  console.log('Could not locate end of flat list map. Manual check required.');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Saved Finance.tsx');

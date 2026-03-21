const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let content = fs.readFileSync(file, 'utf8');

// 1. Add PUT /api/cobrancas/:id just before INICIALIZAÇÃO HÍBRIDA
const insertIndex = content.indexOf('// INICIALIZAÇÃO HÍBRIDA');
if (insertIndex !== -1 && !content.includes("app.put('/api/cobrancas/:id'")) {
  const newEndpoints = `
app.put('/api/cobrancas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { valor, vencimento } = req.body;
    let targetAsaasId = id;
    
    // Attempt mapping
    if (isUUID(id)) {
      const { data } = await supabase.from('alunos_cobrancas').select('asaas_payment_id').eq('id', id).single();
      if (data && data.asaas_payment_id) targetAsaasId = data.asaas_payment_id;
    }

    const aResp = await fetch(\`https://sandbox.asaas.com/api/v3/payments/\${targetAsaasId}\`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json', 'access_token': process.env.ASAAS_API_KEY },
      body: JSON.stringify({ value: valor, dueDate: vencimento })
    });
    
    if (!aResp.ok) {
      const err = await aResp.json().catch(()=>({}));
      return res.status(400).json({ error: err.errors?.[0]?.description || 'Erro ao editar no Asaas' });
    }

    const { error: dbErr } = await supabase.from('alunos_cobrancas').update({ valor, vencimento }).or(\`id.eq.\${id},asaas_payment_id.eq.\${targetAsaasId}\`);
    if (dbErr) return res.status(500).json({ error: 'Erro banco de dados local.' });

    addLog('Edição', \`Cobrança \${targetAsaasId}\`, { valor, vencimento });
    res.json({ message: 'Editado com sucesso' });
  } catch (e) {
    addLog('Server', 'Edição Erro', e.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

app.get('/api/alunos/:id/carne', async (req, res) => {
  try {
    // Puxa o último carnê do aluno
    const { data: cob } = await supabase.from('alunos_cobrancas').select('*').eq('aluno_id', req.params.id).not('asaas_installment_id', 'is', null).order('created_at', { ascending: false }).limit(6);
    if (!cob || cob.length === 0) return res.status(404).json({ error: 'Nenhum carnê no sistema para este Aluno.' });
    
    const latestInstId = cob[0].asaas_installment_id;
    const asaasTargetInstId = formatInstallmentId(latestInstId);
    
    const ar = await fetch(\`https://sandbox.asaas.com/api/v3/installments/\${asaasTargetInstId}\`, { headers: { 'access_token': process.env.ASAAS_API_KEY } });
    if (ar.ok) {
      const data = await ar.json();
      if (data.paymentBookUrl) return res.status(200).json({ status: 'success', type: 'pdf', url: data.paymentBookUrl });
    }

    const { data: allCobs } = await supabase.from('alunos_cobrancas').select('*').eq('asaas_installment_id', latestInstId).order('vencimento', { ascending: true });
    const boletos = (allCobs || []).map((c, i) => ({ id: c.id, numero: i + 1, vencimento: c.vencimento, valor: c.valor, linkBoleto: c.link_boleto, status: c.status, asaasPaymentId: c.asaas_payment_id }));
    return res.status(200).json({ status: 'success', type: 'fallback', boletos, message: 'PDF unificado não disponível. Acesse os boletos individuais.' });
  } catch (error) { return res.status(500).json({ error: 'Erro interno.' }); }
});

`;
  content = content.substring(0, insertIndex) + newEndpoints + content.substring(insertIndex);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully injected API endpoints in server.js');
} else {
  console.log('Skipped server injection or endpoints already exist');
}

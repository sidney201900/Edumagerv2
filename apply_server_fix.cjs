const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let content = fs.readFileSync(file, 'utf8');

// We need to replace the step 1 deletion block in server.js to use the fallback logic cleanly.
const targetBlockStart = content.indexOf('    // ==== PASSO 1: APAGAR NO ASAAS PRIMEIRO ====');
const targetBlockEnd = content.indexOf('    // ==== PASSO 2: SÓ APAGA DO BANCO SE ASAAS DEU OK ====');

if (targetBlockStart !== -1 && targetBlockEnd !== -1) {
  const newBlock = `    // ==== PASSO 1: APAGAR NO ASAAS PRIMEIRO ====
    let fallbackToDB = true;

    if (isInstallmentPackage) {
      console.log(\`[Exclusão] Deletando parcelamento \${id} no Asaas...\`);
      const resp = await fetch(\`https://sandbox.asaas.com/api/v3/installments/\${id}\`, { 
        method: 'DELETE', 
        headers: { 'access_token': process.env.ASAAS_API_KEY } 
      });
      if (resp.ok) {
        addLog('Asaas', 'Exclusão Parcelamento OK', { id });
        fallbackToDB = false;
      } else {
        const errBody = await resp.json().catch(() => ({}));
        addLog('Asaas', 'Exclusão Parcelamento FALHOU', { id, status: resp.status, error: errBody.errors?.[0]?.description });
      }
    } else if (isSinglePayment) {
      console.log(\`[Exclusão] Deletando pagamento \${id} no Asaas...\`);
      const resp = await fetch(\`https://sandbox.asaas.com/api/v3/payments/\${id}\`, { 
        method: 'DELETE', 
        headers: { 'access_token': process.env.ASAAS_API_KEY } 
      });
      if (resp.ok) {
        addLog('Asaas', 'Exclusão Pagamento OK', { id });
        fallbackToDB = false;
      } else {
        const errBody = await resp.json().catch(() => ({}));
        return res.status(400).json({ error: errBody.errors?.[0]?.description || 'Falha ao excluir pagamento avulso no Asaas.' });
      }
    }

    if (fallbackToDB && parcelas && parcelas.length > 0) {
      const instIds = new Set();
      const payIds = new Set();
      parcelas.forEach(p => {
        if (p.asaas_installment_id && p.asaas_installment_id !== '') instIds.add(p.asaas_installment_id);
        if (p.asaas_payment_id?.startsWith('pay_')) payIds.add(p.asaas_payment_id);
      });

      for (const instId of instIds) {
        if (instId === id) continue;
        const resp = await fetch(\`https://sandbox.asaas.com/api/v3/installments/\${instId}\`, { method: 'DELETE', headers: { 'access_token': process.env.ASAAS_API_KEY } });
        if (resp.ok) addLog('Asaas', 'Exclusão OK (Resolver DB)', { instId });
        else addLog('Asaas', 'Exclusão FALHOU (Resolver DB)', { instId });
      }

      for (const payId of payIds) {
        const belongsToInst = parcelas.find(p => p.asaas_payment_id === payId && instIds.has(p.asaas_installment_id));
        if (belongsToInst && instIds.size > 0) continue;

        const resp = await fetch(\`https://sandbox.asaas.com/api/v3/payments/\${payId}\`, { method: 'DELETE', headers: { 'access_token': process.env.ASAAS_API_KEY } });
        if (resp.ok) addLog('Asaas', 'Exclusão Pay OK (Resolver DB)', { payId });
      }
    }

`;

  // We should also look above targetBlockStart and remove the unused variables that we just replaced.
  const searchForDecl = content.lastIndexOf('    // Se asaas_installment_id foi encontrado', targetBlockStart);
  if (searchForDecl !== -1) {
    content = content.substring(0, searchForDecl) + newBlock + content.substring(targetBlockEnd);
  } else {
    content = content.substring(0, targetBlockStart) + newBlock + content.substring(targetBlockEnd);
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully applied backend deletion logic fix (fallback to DB using mapped IDs).');
} else {
  console.log('Could not find deletion blocks in server.js');
}

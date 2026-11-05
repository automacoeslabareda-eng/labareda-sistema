/**
 * Dados do pagador no formato do Mercado Pago (arquivo com "_" => nao vira rota).
 *
 * Mandar nome, CPF, telefone e endereco junto do pagamento melhora a
 * aprovacao do cartao de quem paga SEM conta Mercado Pago (o antifraude
 * recusa mais quando so vem o e-mail) e e obrigatorio no boleto.
 *
 * cliente: { nome, email, telefone, cpf (so digitos), endereco:{rua,numero,bairro,cidade,estado,cep} }
 */
function dadosPagador(cliente) {
  cliente = cliente || {};
  const partes = String(cliente.nome || '').trim().split(/\s+/);
  const first = partes.shift() || '';
  const last = partes.join(' ') || first;
  const doc = String(cliente.cpf || '').replace(/\D/g, '');
  const tel = String(cliente.telefone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const end = cliente.endereco || {};
  const cep = String(end.cep || '').replace(/\D/g, '');
  return {
    first_name: first,
    last_name: last,
    email: cliente.email,
    identification: { type: doc.length === 14 ? 'CNPJ' : 'CPF', number: doc },
    phone: tel.length >= 10 ? { area_code: tel.slice(0, 2), number: tel.slice(2) } : undefined,
    cep: cep,
    end: end,
    // Endereco completo no formato do /v1/payments (boleto exige)
    address: cep ? {
      zip_code: cep,
      street_name: end.rua || '',
      street_number: String(end.numero || 'S/N'),
      neighborhood: end.bairro || '',
      city: end.cidade || '',
      federal_unit: end.estado || '',
    } : undefined,
  };
}

module.exports = { dadosPagador };

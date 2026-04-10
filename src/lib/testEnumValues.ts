import { supabase } from '@/integrations/supabase/client';

/**
 * Testa quais valores de status são aceitos pelo enum do banco
 * Execute no console: await testTicketStatusEnum()
 */
export async function testTicketStatusEnum() {
	try {
		const statusesToTest = [
			'aberto',
			'em_andamento',
			'aguardando_resposta',
			'resolvido',
			'fechado',
			'open',
			'in_progress',
			'waiting_response',
			'resolved',
			'closed',
			'pendente',
			'andamento',
			'resolvido',
			'solved',
		];

		console.log('🧪 Testando valores de enum ticket_status...\n');

		const validStatuses: string[] = [];
		const invalidStatuses: string[] = [];

		for (const status of statusesToTest) {
			try {
				const { error } = await supabase
					.from('tickets')
					.update({ status: status as any })
					.eq('id', '-999999')
					.select()
					.single();

				if (error?.code === '22P02') {
					console.error(`❌ "${status}" - INVÁLIDO (erro de enum)`);
					invalidStatuses.push(status);
				} else if (error?.code === 'PGRST116' || error?.code === 'PGRST301') {
					console.log(`✅ "${status}" - VÁLIDO`);
					validStatuses.push(status);
				} else if (!error) {
					console.log(`✅ "${status}" - VÁLIDO`);
					validStatuses.push(status);
				} else {
					console.log(`⚠️  "${status}" - Erro: ${error.code}`);
				}
			} catch (e) {
				console.log(`⚠️  "${status}" - Exceção`);
			}
		}

		console.log('\n' + '='.repeat(50));
		console.log('📋 RESUMO DO TESTE:');
		console.log('='.repeat(50));
		console.log('✅ Valores VÁLIDOS:', validStatuses);
		console.log('❌ Valores INVÁLIDOS:', invalidStatuses);
		console.log('\n💡 COPIE os valores válidos e atualize o STATUS_MAP em TicketWorkspace.tsx');
		console.log('='.repeat(50) + '\n');

		return validStatuses;
	} catch (err) {
		console.error('Erro ao testar enum:', err);
	}
}

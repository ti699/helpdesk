import React, { useState } from 'react';
import TicketModal from '../../components/TicketModal';
import { supabase } from '../../lib/supabase';

export default function AdminManutencao() {
	const [openModal, setOpenModal] = useState(false);

	async function handleCreateTicket(payload: { title: string; description: string }) {
		try {
			const { error } = await supabase.from('tickets').insert([
				{
					title: payload.title,
					description: payload.description,
					origin: 'admin_manutencao',
				},
			]);
			if (error) throw error;
			// opcional: recarregar lista aqui
		} catch (err) {
			console.error('Erro ao criar ticket (Manutenção)', err);
			throw err;
		}
	}

	return (
		<div>
			{/* ...existing code... */}
			<button onClick={() => setOpenModal(true)}>Criar novo ticket</button>

			<TicketModal
				open={openModal}
				onClose={() => setOpenModal(false)}
				onCreate={handleCreateTicket}
			/>
			{/* ...existing code... */}
		</div>
	);
}
import React, { useState } from 'react';
import TicketModal from '../../components/TicketModal';
import { createTicket } from '../../lib/ticketActions';

export default function AdminTi() {
	const [openModal, setOpenModal] = useState(false);

	async function handleCreateTicket(payload: { title: string; description: string }) {
		try {
			await createTicket({
				titulo: payload.title,
				descricao: payload.description,
				tipo: 'TI',
				categoria: 'Outros',
				prioridade: 'media',
				anexos: { imagens: [], arquivos: [], audio: null },
			});
		} catch (err) {
			console.error('Erro ao criar ticket (TI)', err);
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

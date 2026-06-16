import { updateTicketStatus, TicketStatus } from '@/lib/ticketActions';

type Ticket = {
	id: string | number;
	status: TicketStatus;
	// ...other fields...
};

export default function TicketItem({ ticket, onUpdated }: { ticket: Ticket; onUpdated?: () => void }) {
	// ...existing code...

	async function changeStatus(newStatus: TicketStatus) {
		try {
			await updateTicketStatus(String(ticket.id), newStatus);
			if (onUpdated) onUpdated();
		} catch (err) {
			console.error('Erro ao alterar status do ticket', err);
		}
	}

	return (
		// ...existing code...
		<div>
			{/* ...existing code... */}
			<select value={ticket.status} onChange={e => changeStatus(e.target.value as TicketStatus)}>
				<option value="aberto">Aberto</option>
				<option value="em_andamento">Em andamento</option>
				<option value="aguardando_resposta">Aguardando resposta</option>
				<option value="resolvido">Resolvido</option>
				<option value="fechado">Fechado</option>
			</select>
		</div>
		// ...existing code...
	);
}

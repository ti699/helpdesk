import React from 'react';
import { supabase } from '../lib/supabase';

type Ticket = {
	id: string | number;
	status: string;
	// ...other fields...
};

export default function TicketItem({ ticket, onUpdated }: { ticket: Ticket; onUpdated?: () => void }) {
	// ...existing code...

	async function changeStatus(newStatus: string) {
		try {
			const { data, error } = await supabase
				.from('tickets')
				.update({ status: newStatus })
				.eq('id', ticket.id)
				.select()
				.single();

			if (error) throw error;
			if (onUpdated) onUpdated();
		} catch (err) {
			console.error('Erro ao alterar status do ticket', err);
		}
	}

	return (
		// ...existing code...
		<div>
			{/* ...existing code... */}
			<select value={ticket.status} onChange={e => changeStatus(e.target.value)}>
				<option value="open">Open</option>
				<option value="in_progress">In Progress</option>
				<option value="closed">Closed</option>
			</select>
		</div>
		// ...existing code...
	);
}
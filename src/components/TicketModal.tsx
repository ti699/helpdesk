import React, { useState, useEffect } from 'react';

type Props = {
	open: boolean;
	onClose: () => void;
	onCreate: (data: { title: string; description: string }) => Promise<void> | void;
	// ...other props...
};

export default function TicketModal({ open, onClose, onCreate }: Props) {
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');

	useEffect(() => {
		if (!open) {
			// reset fields when modal is closed
			setTitle('');
			setDescription('');
		}
	}, [open]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault(); // evita reload/fechamento inesperado
		try {
			await onCreate({ title, description });
			// limpar e fechar só após sucesso (onCreate pode lançar)
			setTitle('');
			setDescription('');
			onClose();
		} catch (err) {
			console.error('Erro ao criar ticket', err);
		}
	}

	if (!open) return null;

	return (
		<div className="ticket-modal">
			<form onSubmit={handleSubmit}>
				<input
					placeholder="Título"
					value={title}
					onChange={e => setTitle(e.target.value)}
				/>
				<textarea
					placeholder="Descrição"
					value={description}
					onChange={e => setDescription(e.target.value)}
				/>
				<button type="submit">Criar ticket</button>
				<button type="button" onClick={onClose}>Cancelar</button>
			</form>
		</div>
	);
}
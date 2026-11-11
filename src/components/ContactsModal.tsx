import type { CatalogSettings } from '../types';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { Wordmark } from './Header';

export function ContactsModal({ contacts, onClose, onEdit }: { contacts: CatalogSettings['contacts']; onClose: () => void; onEdit: () => void }) {
  return <Modal title="Контакты" onClose={onClose} className="contacts-modal">
    <div className="contacts-brand"><Wordmark /><span>АРХИТЕКТУРА СТИЛЯ</span></div>
    <div className="contact-rows">
      <div className="contact-row"><Icon name="phone" /><div><span className="field-label">ТЕЛЕФОН</span>{contacts.phone ? <a href={`tel:${contacts.phone.replace(/[^+\d]/g, '')}`}>{contacts.phone}</a> : <span className="contact-empty">Пока не указан</span>}</div></div>
      <div className="contact-row"><Icon name="mail" /><div><span className="field-label">ЭЛЕКТРОННАЯ ПОЧТА</span>{contacts.email ? <a href={`mailto:${encodeURIComponent(contacts.email)}`}>{contacts.email}</a> : <span className="contact-empty">Пока не указана</span>}</div></div>
      <div className="contact-row"><Icon name="pin" /><div><span className="field-label">АДРЕС</span><span className={contacts.address ? '' : 'contact-empty'}>{contacts.address || 'Пока не указан'}</span></div></div>
    </div>
    <button className="text-button contact-edit" onClick={onEdit}><Icon name="settings" size={16} /> Редактировать контакты</button>
  </Modal>;
}

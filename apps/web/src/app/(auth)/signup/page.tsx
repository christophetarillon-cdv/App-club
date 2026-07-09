import { redirect } from 'next/navigation';

// Inscription libre desactivee : seuls les danseurs deja crees par le club
// (ou via le QR code d'accueil /welcome, qui cree un compte en essai) peuvent
// se connecter.
export default function SignupPage() {
  redirect('/login');
}

import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth';

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "home"
  },
  {
    path: "login",
    loadComponent: () => import('./components/page/login').then(m => m.LoginPage),
    title: "Sign In · Eleanor",
  },
  {
    path: 'home',
    loadComponent: () => import('./components/page/home').then(m => m.HomePage),
    canActivate: [authGuard],
    title: 'Eleanor'
  },
  {
    path: 'settings',
    loadComponent: () => import('./components/page/settings').then(m => m.SettingsPage),
    canActivate: [authGuard],
    title: 'Settings · Eleanor'
  },
  {
    path: 'security',
    loadComponent: () => import('./components/page/security').then(m => m.SecurityPage),
    canActivate: [authGuard],
    title: 'Security · Eleanor'
  },
  {
    path: "**",
    redirectTo: "home"
  }
];
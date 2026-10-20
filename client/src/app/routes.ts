import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "home"
  },
  {
    path: 'home',
    loadComponent: () => import('./components/page/home').then(m => m.HomePage),
    // data: { animation: routeAnimationIndex('home') },
  },
  {
    path: 'settings',
    loadComponent: () => import('./components/page/settings').then(m => m.SettingsPage),
    // data: { animation: routeAnimationIndex('about') },
  },
  {
    path: "**",
    redirectTo: "home"
  }
];
import {PlaygroundNavLink} from './playground-nav-link';
import { Gem } from 'lucide-react';
export function ProductLogo() {return <a className="product-logo" href="/"><span><Gem size={24}/></span>Loot Manager</a>;}
export function SiteNav() {return <header className="product-nav"><ProductLogo/><nav aria-label="Main navigation"><a href="/#product">Product</a><a href="/pricing">Pricing</a><a href="/shop">Loot shops</a><a href="/inquiries">Inquiries</a><PlaygroundNavLink/></nav></header>;}
export function SiteFooter(){return <footer className="product-footer"><div><ProductLogo/><p>Every drop has a story. Every reward has a home.</p><small>Created by Kevin Loquencio</small></div><nav aria-label="Footer navigation"><a href="/#product">Product</a><a href="/pricing">Pricing</a><a href="/shop">Loot shops</a><a href="/inquiries">Player inquiries</a><a href="/login">Sign in</a><a href="/playgrounds">Your playgrounds</a></nav><span>Built for the party.</span></footer>;}

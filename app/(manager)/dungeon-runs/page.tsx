import type { Metadata } from "next";
import ManagerApp from "../../components/manager-app";

export const metadata: Metadata = { title: "Dungeon Runs Loot Ledger" };
export default function DungeonRunsPage() { return <ManagerApp initialTab="runs" />; }

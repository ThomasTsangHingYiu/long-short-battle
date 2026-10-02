import { createFileRoute } from "@tanstack/react-router";
import { Menu } from "@/components/game/menu";
import { Rules } from "@/components/game/rules";
import { Table } from "@/components/game/table";
import { useMatch } from "@/game/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const view = useMatch((s) => s.view);
  if (view === "rules") return <Rules />;
  if (view === "table") return <Table />;
  return <Menu />;
}

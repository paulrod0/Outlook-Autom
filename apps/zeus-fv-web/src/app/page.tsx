import { MapWorkspace } from "@/components/MapWorkspace";
import { ProjectPanel } from "@/components/ProjectPanel";

export default function Home() {
  return (
    <main className="grid h-screen grid-cols-[1fr_380px] grid-rows-1">
      <MapWorkspace />
      <ProjectPanel />
    </main>
  );
}

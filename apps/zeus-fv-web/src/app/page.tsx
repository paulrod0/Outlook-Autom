import { MapWorkspace } from "@/components/MapWorkspace";
import { ProjectPanel } from "@/components/ProjectPanel";

export default function Home() {
  return (
    <main className="flex min-h-[100dvh] flex-col md:grid md:h-screen md:grid-cols-[1fr_380px] md:grid-rows-1">
      <div className="relative h-[60vh] min-h-[320px] md:h-auto md:min-h-0">
        <MapWorkspace />
      </div>
      <ProjectPanel />
    </main>
  );
}

import { CatalogueDirectory } from "@/features/discovery/CatalogueDirectory";
import { DiscoveryFooter } from "@/components/DiscoveryFooter";
export default function Explore() {
  return (
    <div className="explore-page explore-directory">
      <CatalogueDirectory />
      <DiscoveryFooter />
    </div>
  );
}

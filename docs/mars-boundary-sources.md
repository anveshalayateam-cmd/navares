# Mars assigned-area boundary sources

The editable source is [anveshalayateam-cmd/navares](https://github.com/anveshalayateam-cmd/navares), deployed at https://ilovemars.ai.studio/.

The authoritative geometry source is the [USGS/IAU Gazetteer](https://planetarynames.wr.usgs.gov/). Each imported ring comes from the corresponding official feature page’s published WKT string, normalized from planetocentric east longitude 0–360° to Cesium east longitude −180°..180°. The Gazetteer documents that these named-feature boundaries are approximate extents rather than surveyed geologic contacts. The [Olympus Mons feature page](https://planetarynames.wr.usgs.gov/Feature/4453) is a representative example.

The [USGS GIS download page](https://planetarynames.wr.usgs.gov/GIS_Downloads) currently offers a Mars bulk center-point archive at [MARS_nomenclature_center_pts.zip](https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip); that archive contains points, not perimeters. The source update therefore resolves official feature IDs from that index and retrieves the WKT from each feature page.

The resulting source dataset contains 95 official WKT rings for the 97 landmark locations. The two remaining entries—`swim-arcadia-ice` and `chryse-acidalia-pass`—are custom application zones without a corresponding approved Gazetteer perimeter, so they intentionally retain the existing calibrated geodesic fallback. Tiny features were not replaced with invented geometry.

The rendering behavior is unchanged: `src/components/MarsGlobe.tsx` removes the previous assigned-area entity, creates one new polygon only when a landmark badge is selected, and removes it again when selection is cleared or changes. Area highlights remain hidden by default.

# Notice

**Komyosys POS** is a modified version of
[Nodedr OrderRestro](https://github.com/Raktim94/nodedr-restaurant-pos),
Copyright © 2026 Nodedr Infotech Private Limited and Raktim Ranjit,
licensed under the GNU Affero General Public License v3.0 (see [`LICENSE`](./LICENSE)).

Modifications by Komyosys, first made on 31 October 2026, and licensed under the same AGPL-3.0 terms:

- Rebranded the user interface: product name, logo, icons, favicon and colour theme
  (Komyosys orange) in place of the OrderRestro branding.
- Pointed support, source, update-check and download links at Komyosys and at this repository.
- Added "Based on OrderRestro (AGPL-3.0) · Source" notices to the login screen, landing page and
  app sidebar, linking to this repository as required by AGPL-3.0 section 13.
- Removed the India compliance notes page, whose statements described a self-hosted install
  rather than a hosted service.
- Added `docker-compose.vps.yml` for deployment behind Traefik on a shared server.

The full history of these changes is in this repository's git log, on top of upstream
commit `db981ec` (OrderRestro release 1.10.0).

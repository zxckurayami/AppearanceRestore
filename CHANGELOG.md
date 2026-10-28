# 1.1.2

- Repair generated sticker and Smooth UI imports left by the former local publisher.
- Regenerate selected components in the current profile even when the old storage was deleted.
- Keep unrelated imports and original images unchanged; back up the previous imports before applying repairs.
- Explain missing generated files in English and Russian when their component is not selected.

# 1.1.1

- Refine the restore-arrow and paintbrush icon with balanced spacing and cleaner shapes.
- Supply a 512 px PNG icon and matching Marketplace banner metadata.
- Use the publisher ID zxckurayami for Marketplace publication.
- Keep appearance restoration behavior unchanged.

# 1.1.0

- Add an explicit Smooth UI step with active-version import repair and duplicate prevention.
- Connect configured custom Doki stickers offline without requiring previous Doki installation flags.
- Preserve image bytes, Doki positioning and user CSS/JS imports.
- Verify the actual Custom CSS injection instead of assuming a returned command succeeded.
- Back up previous User imports and revert unused changes when CSS application fails.
- Add the Appearance Restore icon.

# 1.0.0

- Detect editor and supported appearance-extension version changes.
- Offer a confirmed, ordered restoration through installed extensions.
- Wait for explicit acknowledgement of Doki's background operation.
- Back up critical editor files and serialize restoration across windows.
- Keep Fix Checksums opt-in; do not restart, elevate or change settings.
- Russian and English native VS Code UI.

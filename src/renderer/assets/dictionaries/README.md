# Bundled spellcheck dictionaries

These Hunspell dictionaries and the supplemental word list are bundled into the
app (imported as `?raw` assets by the renderer's JS spellchecker) so the
sandboxed renderer never touches the filesystem (spec 020 / 025).

| File | Source | Entries |
|------|--------|---------|
| `en-us.aff`, `en-us.dic` | en_US-large — English (United States), SCOWL/ESDB size 70, 2026.02.25 release | ~77k |
| `en-gb.aff`, `en-gb.dic` | en_GB-large — English (United Kingdom, both -ise and -ize), SCOWL/ESDB size 70, 2026.02.25 release | ~78k |
| `supplemental-words.txt` | App-curated list (spec 025) — domain/technical/proper-noun-derived terms absent from the dictionaries, one lowercase word per line | 20 |

The dictionaries were previously the standard (size 60) en-US/en-GB sets from
the same lineage; spec 025 upgrades them to the size-70 (`-large`) variants and
adds the supplemental list.

## License

The English dictionaries come from SCOWL/ESDB
(https://wordlist.aspell.net/dicts/), release 2026.02.25:

> Copyright 2000-2026 by Kevin Atkinson
>
> Permission to use, copy, modify, distribute, and sell any part of SCOWLv2, or
> word lists created from it, is hereby granted without fee, provided that the
> above copyright notice appears in all copies and that both the above
> copyright notice and this notice appear in supporting documentation.

The affix files are a heavily modified version of the original english.aff
released as part of Geoff Kuenning's Ispell, covered by his BSD license (see
the README inside each dictionary zip for the full terms).

The supplemental word list is original to this project (spec 025) and is
covered by the project's own license.

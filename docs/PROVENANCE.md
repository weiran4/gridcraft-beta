# Editor provenance
Editor ancestry: Branch Builder (https://github.com/weiran4/network_node), commit 661856b. The adapted editing logic is included locally; there is no runtime dependency on that repository.

Adapted from index.html:
- netGroups: union-find connectivity → core/network/graph.js; stable terminal keys replace transient numbered net identity.
- snapshot/restore/undo/redo and copySelectedBranches/pasteCopiedBranches → ui/history.js; same clone/remap/history approach, new component model and IBR reference remapping.
- connectTerminals duplicate suppression and wire insertion → ui/editor.js; AC/DC validation replaces old dummy-node checks.
- toSvgPoint, wheel anchored zoom, pointer move/marquee/pan, renderWires and snappedWireMid → ui/editor.js; preserved SVG coordinate mechanics and three-point routing.

New: component symbols and balanced AC ports, SI schemas, validation, radial grid strength calculation, result panel and application shell.
The migration adapts original functions to a class and new schema. It is not a byte-for-byte copy of the old monolithic page, and does not carry over its solver or packaging code. Regression tests cover migrated history/copy; browser verification covers interaction workflows.

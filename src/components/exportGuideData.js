// Step-by-step instructions for exporting a GEDCOM file from the major
// genealogy sites. Steps verified against each provider's official help docs.
export const PROVIDERS = [
  {
    name: 'Ancestry',
    helpUrl:
      'https://support.ancestry.com/s/article/Uploading-and-Downloading-Trees',
    steps: [
      'Click Trees in the top menu and open the tree you want.',
      'Click the tree name in the top-left, then choose Tree Settings.',
      'Under "Manage your tree", click Export tree.',
      'When the file is ready, click Download your GEDCOM file.',
    ],
    note: 'Only the tree owner can export. Photos and DNA results are not included.',
  },
  {
    name: 'MyHeritage',
    helpUrl:
      'https://www.myheritage.com/help/en/articles/12851866-how-do-i-download-export-a-gedcom-file-of-my-family-tree-from-my-family-site',
    steps: [
      'Hover over the Family tree tab and choose Manage trees.',
      'Find your tree and click Export to GEDCOM in the Actions column.',
      'Choose whether to include photos, then click Begin the export.',
      "You'll get an email with a link to download the GEDCOM file.",
    ],
    note: 'Using the Family Tree Builder desktop app? Use File → Export → GEDCOM instead.',
  },
  {
    name: 'FamilySearch',
    helpUrl: 'https://www.familysearch.org/innovate/export',
    steps: [
      'FamilySearch cannot export its shared tree as a plain GEDCOM directly.',
      'Go to familysearch.org/innovate/export to download up to 8 generations of your ancestors in GEDCOM 7 format.',
      'Alternatively, use a partner app such as RootsMagic to pull your data and export a GEDCOM.',
    ],
    note: null,
  },
  {
    name: 'Geni',
    helpUrl:
      'https://help.geni.com/hc/en-us/articles/229705167-How-can-I-export-my-GEDCOM',
    steps: [
      'Click the Family tab, then Share Your Tree.',
      'Click Export. Geni will generate the file and email you a download link.',
    ],
    note: 'Free accounts can export a limited number of profiles; Pro accounts export more.',
  },
  {
    name: 'Findmypast',
    helpUrl:
      'https://www.findmypast.com/help/articles/206598369-how-do-i-download-my-family-tree-from-findmypast',
    steps: [
      'Click My Family Tree in the top menu, then View all trees.',
      'Hover over the icons to the right of your tree and click Export tree.',
      'The GEDCOM file is saved to your computer when the export finishes.',
    ],
    note: null,
  },
]

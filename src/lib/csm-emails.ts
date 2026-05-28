/**
 * The canonical roster of CSM emails offered in the "Assign CSM" dropdown.
 *
 * Kept here (not in the database) so adding/removing a CSM is a one-line code
 * change reviewed via PR. Sorted alphabetically for predictable dropdown order.
 *
 * If you need to update this, add the email below and redeploy.
 */
export const CSM_EMAILS: readonly string[] = [
  "abhijeet.mitra@spyne.ai",
  "akash.jaiswal@spyne.ai",
  "ankur.batra@spyne.ai",
  "ankur.patel@spyne.ai",
  "anmol.sehgal@spyne.ai",
  "anshu.kumar@spyne.ai",
  "anuj.tewatia@spyne.ai",
  "archit.gupta@spyne.ai",
  "arun.prakash@spyne.ai",
  "avinash.jha@spyne.ai",
  "deepanshu.agarwal@spyne.ai",
  "ishika.arora@spyne.ai",
  "jagrit@spyne.ai",
  "jaspreet.kaur@spyne.ai",
  "jatin.arora@spyne.ai",
  "jatin.makkar@spyne.ai",
  "jay.berry@spyne.ai",
  "kshiteej.jaiswal@spyne.ai",
  "liam.fallon@spyne.ai",
  "madhav.uppal@spyne.ai",
  "manpreet.kaur@spyne.ai",
  "neelima.tiwari@spyne.ai",
  "pallav.pandey@spyne.ai",
  "prabha.kumari@spyne.ai",
  "prakash.kumar@spyne.ai",
  "prathamesh.prashant@spyne.ai",
  "prince.arora@spyne.ai",
  "puneet.sharma@spyne.ai",
  "ritika.agarwal@spyne.ai",
  "rupesh.rawat@spyne.ai",
  "saarthak.seth@spyne.ai",
  "sanu.chandra@spyne.ai",
  "sanyam.tyagi@spyne.ai",
  "saurabh.nawale@spyne.ai",
  "saurabh.shah@spyne.ai",
  "shivam.ahuja@spyne.ai",
  "tushar.srivastava@spyne.ai",
  "vanshit.kothari@spyne.ai",
  "vedant.choudhary@spyne.ai",
  "vishal.singh1@spyne.ai",
  "vivek@spyne.ai",
  "zeeshana.aijaz@spyne.ai",
] as const;

/** Quick membership check for client-side validation in the Assign CSM picker. */
export function isKnownCsmEmail(email: string): boolean {
  return CSM_EMAILS.includes(email.trim().toLowerCase());
}

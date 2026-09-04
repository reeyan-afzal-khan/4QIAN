/* scaffold-source.mjs — the AREC frame for every question without a model.
 *
 * 4,228 hand-written model answers is not a thing anyone should pretend to
 * have. What can be offered for every question is the structure, with openers
 * that fit the grammar the question is actually built on: "Do you ...?" wants
 * a commitment, "Would you rather ...?" wants a choice named out loud, and
 * "What would you do if ...?" wants a conditional. A generic four-line
 * template that ignores the frame teaches nothing the heading did not.
 *
 * Each kind gives A and C; R and E are the same two moves everywhere, because
 * "because" and "for example" really are the whole trick.
 */
export const KINDS = {
  yesno: {
    nm: "Yes / no question",
    a: ["Yes — and the reason is not the obvious one.", "是的，不过原因可能不是最明显的那个。"],
    c: ["So my answer is yes, with that one qualification.", "所以我的回答是肯定的，只是有这么一个前提。"]
  },
  choice: {
    nm: "A or B",
    a: ["I'd take the first one, though it's close.", "我会选第一个，虽然两个差得不多。"],
    c: ["So I'd choose that one, and I'd be happy either way.", "所以我会选那个，不过选另一个我也能接受。"]
  },
  opinion: {
    nm: "Opinion",
    a: ["I think it should, but not in the form it's usually proposed.", "我觉得应该，但不是通常提出的那种做法。"],
    c: ["So I'm in favour of the idea and wary of the usual version of it.", "所以我赞成这个想法，但对通常的做法有保留。"]
  },
  hypo: {
    nm: "Hypothetical",
    a: ["I'd probably do the least dramatic thing available.", "我大概会选最不夸张的那个做法。"],
    c: ["So the honest answer is duller than the question invites.", "所以真实的答案，比这个问题期待的要平淡一些。"]
  },
  describe: {
    nm: "Describe",
    a: ["The clearest way to describe it is by one detail.", "最清楚的说法，是从一个细节讲起。"],
    c: ["So that detail is really what the whole thing comes down to.", "所以整件事，基本就落在那个细节上。"]
  },
  open: {
    nm: "Open question",
    a: ["Probably the one I'd least expect to name.", "大概是我自己最想不到的那一个。"],
    c: ["So that's the one I'd pick, for that reason rather than any other.", "所以我会选它，理由就是这个，不是别的。"]
  }
};

/* The two middle moves, identical everywhere. */
export const MIDDLE = {
  r: ["Mainly because ...", "主要是因为……"],
  e: ["For example, last year ...", "比如说，去年……"]
};

/* frame text -> kind. Matched longest-prefix-first at build time. */
export const FRAME_KIND = [
  ["Would you rather", "choice"], ["Which", "choice"],
  ["Should", "opinion"], ["Do you think", "opinion"], ["What do you think", "opinion"],
  ["Do you believe", "opinion"], ["Is it", "opinion"], ["What should", "opinion"],
  ["If you could", "hypo"], ["If you", "hypo"], ["If", "hypo"],
  ["What would you do", "hypo"], ["What would", "hypo"], ["Would you", "hypo"],
  ["Describe", "describe"], ["Tell me", "describe"], ["Explain", "describe"], ["Define", "describe"],
  ["Do you", "yesno"], ["Did you", "yesno"], ["Are you", "yesno"], ["Have you", "yesno"],
  ["Can you", "yesno"], ["Could you", "yesno"], ["Are there", "yesno"], ["Does", "yesno"],
  ["Do ", "yesno"], ["Is ", "yesno"], ["Are ", "yesno"], ["Has ", "yesno"], ["Was ", "yesno"],
];

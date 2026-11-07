import { expect, test } from "bun:test";

import { parseFfxivUltimate } from "./ffxiv-ultimate";

const completionTime = `
  <time class="entry__activity__time">
    <script>document.getElementById('date').innerHTML = ldst_strftime(1784303553, 'YMD');</script>
  </time>`;

function detailPage(completed: boolean, date = "") {
  return `
    <div class="ldst__achievement achievement__view">
      <div class="entry">
        <div class="entry__achievement__view${completed ? " entry__achievement__view--complete" : ""}">
          <div class="entry__achievement--history">
            <p class="entry__activity__txt">絶竜詩戦争を平定せし者</p>
            ${date}
          </div>
        </div>
      </div>
      <div class="achievement__base">
        <h3 class="achievement__base--title">報酬称号</h3>
        <p class="achievement__base--text">the Heavens&#39; Legend</p>
      </div>
    </div>
    ${completionTime}`;
}

test("Lodestone uses the completed achievement's timestamp and decodes its title", () => {
  expect(parseFfxivUltimate(detailPage(true, completionTime))).toEqual({
    name: "絶竜詩戦争を平定せし者",
    rewardTitle: "the Heavens' Legend",
    completedAt: new Date(1784303553000),
  });
  expect(parseFfxivUltimate(detailPage(false))).toBeNull();
});

test("Lodestone errors and missing completion dates cannot look like a pending achievement", () => {
  expect(() => parseFfxivUltimate("<h1>非公開</h1>")).toThrow(
    "Achievement detail unavailable",
  );
  expect(() => parseFfxivUltimate(detailPage(true))).toThrow(
    "Missing or invalid completion data",
  );
});

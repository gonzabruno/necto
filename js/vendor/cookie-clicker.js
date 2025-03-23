// Constantes inmutables
const GCOOKIE_FIXED_INTERVALS = Object.freeze({
  FARM: 45000,
  GOLDEN: 500,
  FORTUNE: 1500,
  MAGIC: 2000,
  LUMP: 120000,
  WRINKLER: 90000,
  REFRESH_FOOLS: 90000,
  PLEDGE: 240000,
  CLICK_COOKIE: 2,
});

// Valores configurables
const GCOOKIE_CONFIG = {
  BUY_ALL: 60000,
  AUTO_BUY_DEFAULT: 900000,
};

const gCookie = {
  active: {
    key0: false,
    key1: false,
    key2: false,
    key5: false,
    key8: false,
    key9: false,
  },
  intervals: {},
  timeouts: {},
};

(function ($) {
  const updateEvent = new Event("infoUpdated");
  let debounceTimeout;
  let plotsUnlocked = 0;
  let plotsOccupied = 0;
  let gardenCostOverridden = false;
  let intervalAutoBuyPeriod = GCOOKIE_CONFIG.AUTO_BUY_DEFAULT;

  const setGameInterval = (key, callback, delay) => {
    clearInterval($.intervals[key]);
    $.intervals[key] = setInterval(callback, delay);
  };

  const setGameTimeout = (key, callback, delay) => {
    clearTimeout($.timeouts[key]);
    $.timeouts[key] = setTimeout(callback, delay);
  };

  const dispatchUpdate = () => {
    document.dispatchEvent(updateEvent);
  };

  const loadInitialState = () => {
    const savedState = JSON.parse(localStorage.getItem("gcookie-data")) ?? {};
    $.active = { ...$.active, ...savedState };
  };

  const saveCurrentState = () => {
    const toSave = {
      key0: !$.active.key0,
      key1: !$.active.key1,
      key5: !$.active.key5,
      key8: !$.active.key8,
      key9: !$.active.key9,
    };
    localStorage.setItem("gcookie-data", JSON.stringify(toSave));
  };

  // change getCost to ignore GG cps increases.
  const overrideGardenGetCost = () => {
    if (Game.Objects["Farm"].minigame) {
      Game.Objects["Farm"].minigame.getCost = function (me) {
        if (Game.Has("Turbo-charged soil")) return 0;
        return (
          Math.max(me.costM, Game.cookiesPsRaw * me.cost * 60) *
          (Game.HasAchiev("Seedless to nay") ? 0.95 : 1)
        );
      };
      gardenCostOverridden = true;
      dispatchUpdate();
    }
  };

  // change reindeer cookies to notify when they are unlocked.
  const overrideReindeerPopFunction = () => {
    if (Game.shimmerTypes["reindeer"]) {
      Game.shimmerTypes["reindeer"].popFunc = function (me) {
        //get achievs and stats
        if (me.spawnLead) {
          Game.reindeerClicked++;
        }

        var val = Game.cookiesPs * 60;
        if (Game.hasBuff("Elder frenzy")) val *= 0.5; //very sorry
        if (Game.hasBuff("Frenzy")) val *= 0.75; //I sincerely apologize
        var moni = Math.max(25, val); //1 minute of cookie production, or 25 cookies - whichever is highest
        if (Game.Has("Ho ho ho-flavored frosting")) moni *= 2;
        moni *= Game.eff("reindeerGain");
        Game.Earn(moni);
        if (Game.hasBuff("Elder frenzy")) Game.Win("Eldeer");

        var cookie = "";
        var failRate = 0.8;
        if (Game.HasAchiev("Let it snow")) failRate = 0.6;
        failRate *= 1 / Game.dropRateMult();
        if (Game.Has("Starsnow")) failRate *= 0.95;
        if (Game.hasGod) {
          var godLvl = Game.hasGod("seasons");
          if (godLvl == 1) failRate *= 0.9;
          else if (godLvl == 2) failRate *= 0.95;
          else if (godLvl == 3) failRate *= 0.97;
        }
        if (Math.random() > failRate) {
          //christmas cookie drops
          cookie = choose([
            "Christmas tree biscuits",
            "Snowflake biscuits",
            "Snowman biscuits",
            "Holly biscuits",
            "Candy cane biscuits",
            "Bell biscuits",
            "Present biscuits",
          ]);
          if (!Game.HasUnlocked(cookie) && !Game.Has(cookie)) {
            Game.Unlock(cookie);
            // gonza override: start
            Game.Notify(
              loc("You found a cookie!"),
              "<b>" + cookie + "</b>",
              Game.Upgrades[cookie].icon
            );
            // gonza override: end
          } else cookie = "";
        }

        var popup = "";

        Game.Notify(
          loc("You found %1!", choose(loc("Reindeer names"))),
          loc("The reindeer gives you %1.", loc("%1 cookie", LBeautify(moni))) +
            (cookie == ""
              ? ""
              : "<br>" +
                loc(
                  "You are also rewarded with %1!",
                  Game.Upgrades[cookie].dname
                )),
          [12, 9],
          6
        );
        popup =
          '<div style="font-size:80%;">' +
          loc("+%1!", loc("%1 cookie", LBeautify(moni))) +
          "</div>";

        if (popup != "") Game.Popup(popup, Game.mouseX, Game.mouseY);

        //sparkle and kill the shimmer
        Game.SparkleAt(Game.mouseX, Game.mouseY);
        PlaySound("snd/jingleClick.mp3");
        me.die();
      };
    }
  };

  // auto-click golden and reindeer cookies
  const clickGoldenCookie = function () {
    Game.shimmers.forEach(function (shimmer) {
      if (
        shimmer.type == "reindeer" ||
        (shimmer.type == "golden" &&
          (Game.elderWrath > 0 || (Game.elderWrath == 0 && shimmer.wrath == 0)))
      ) {
        shimmer.pop();
      }
    });
  };

  // pop first wrinkler when all there are the maximum amount of wrinklers present.
  const popWrinklers = function () {
    if (Game.elderWrath === 0) {
      // if it's not the apocalypse, stop here.
      return;
    }
    const maxWrinklers = Game.getWrinklersMax();

    var wrinkCount = 0;
    var wrinkEaten = 0;
    var wrinkIndex = maxWrinklers; // value for all shinies test

    Game.wrinklers.forEach((wrinkler, i) => {
      // count number of eating wrinks
      if (wrinkler.sucked > 0) {
        wrinkCount += 1;
      }
      // find top wrink index, ignoring shiny wrinklers
      if (wrinkler.sucked > wrinkEaten && wrinkler.type == 0) {
        wrinkEaten = wrinkler.sucked;
        wrinkIndex = i;
      }
    });

    // pop top wrinkler if all are eating, unless all of them are shiny
    if (wrinkCount == maxWrinklers && wrinkIndex != maxWrinklers) {
      Game.wrinklers[wrinkIndex].hp = 0;
    }
  };

  // pop all wrinklers
  const popAllWrinklers = function () {
    if (Game.elderWrath === 0) {
      // if it's not the apocalypse, stop here.
      return;
    }

    let i = 0;
    Game.wrinklers.forEach((wrinkler) => {
      if (wrinkler.type == 0 && wrinkler.sucked > 0) {
        setTimeout(() => {
          wrinkler.hp = 0;
        }, i * 500);
        i += 1;
      }
    });
  };

  // harvest mature plants and re-seed them
  const autoHarvestAndPlant = function (M, onlyHarvestMature = false) {
    if (!M) {
      return;
    }

    if (!gardenCostOverridden) {
      overrideGardenGetCost();
    }

    plotsUnlocked = 0;
    plotsOccupied = 0;

    var nextTick =
      ((((M.nextStep - Date.now()) / 1000) * 30 + 30) / Game.fps) * 1000;
    var shouldHarvest = nextTick < GCOOKIE_FIXED_INTERVALS.FARM * 1.5;
    for (var y = 0; y < 6; y++) {
      for (var x = 0; x < 6; x++) {
        if (M.isTileUnlocked(x, y)) {
          plotsUnlocked += 1;
          var tile = M.plot[y][x];
          var me = M.plantsById[tile[0] - 1];
          if (tile[0] > 0) {
            plotsOccupied += 1;
            // age
            var age = tile[1];
            var maxTick = Math.ceil(
              (me.ageTick + me.ageTickR) * M.plotBoost[y][x][0]
            );
            var limit = Math.min(97, 100 - maxTick);
            if (!onlyHarvestMature && (me.weed || me.fungus)) {
              // kill weeds
              M.harvest(x, y);
              console.log(`💀 killed: ${me.name} at x: ${x}, y: ${y}.`);
            } else if (age >= limit && shouldHarvest) {
              // harvest useful plants
              M.harvest(x, y);
              console.log(
                `✅ harvested: ${me.name} at x: ${x}, y: ${y}. Age: ${age}. Mature: ${me.mature}. Tick: ${me.ageTick}. Limit: ${limit}`
              );
              if (!onlyHarvestMature) {
                // replant them
                M.useTool(me.id, x, y);
                console.log(`🌱 planted: ${me.name} at x: ${x}, y: ${y}.`);
              }
            }
          }
        }
      }
    }
  };

  // click fortune news
  const clickFortuneNews = function () {
    if (Game.TickerEffect && Game.TickerEffect.type == "fortune") {
      Game.Ticker = "";
      Game.TickerClicks++;
      PlaySound("snd/fortune.mp3", 1);
      Game.SparkleAt(Game.mouseX, Game.mouseY);
      var effect = Game.TickerEffect.sub;
      if (effect == "fortuneGC") {
        Game.Notify(
          loc("Fortune!"),
          loc("A golden cookie has appeared."),
          [10, 32]
        );
        Game.fortuneGC = 1;
        var newShimmer = new Game.shimmer("golden", { noWrath: true });
      } else if (effect == "fortuneCPS") {
        Game.Notify(
          loc("Fortune!"),
          loc(
            "You gain <b>one hour</b> of your CpS (capped at double your bank)."
          ),
          [10, 32]
        );
        Game.fortuneCPS = 1;
        Game.Earn(Math.min(Game.cookiesPs * 60 * 60, Game.cookies));
      } else {
        Game.Notify(
          effect.dname,
          loc("You've unlocked a new upgrade."),
          effect.icon
        );
        effect.unlock();
        console.log(`🥠 ${effect.dname} clicked!`);
      }
      Game.TickerEffect = 0;
    }
  };

  // cast spell automatically
  const castSpell = function (M) {
    if (!M) {
      return;
    }

    const ignoredBuffs = [
      "Frenzy",
      "Everything must go",
      "Cookie storm",
      "Click frenzy",
      "Clot",
      "Loan 1",
      "Loan 1 (interest)",
      "Loan 2",
      "Loan 2 (interest)",
      "Loan 3",
      "Loan 3 (interest)",
    ];

    const appliedBuffs = Object.keys(Game.buffs).filter(
      (buff) => !ignoredBuffs.includes(buff)
    );

    if (appliedBuffs.length > 0) {
      const handOfFateSpell = M.spellsById[1];
      const spellCost = M.getSpellCost(handOfFateSpell);
      const [buffName] = appliedBuffs;
      const buff = Game.buffs[buffName];
      // const tooEarly = 3 + buff.maxTime / Game.fps / 2; // a bit before half time
      // const tooLate = 3 + buff.maxTime / Game.fps / 3; // only a third of the time is left
      const tooEarly = Infinity;
      const tooLate = 3 + (3 * buff.maxTime) / Game.fps / 4; // almost a quarter of the time gone
      const currentTime = buff.time / Game.fps;
      const shouldPressHandOfGod =
        currentTime < tooEarly && currentTime > tooLate;

      if (false && M.magic > spellCost + 5) {
        console.log(
          `tooEarly: ${tooEarly} - currentTime: ${currentTime} - tooLate: ${tooLate} - shouldPress? ${shouldPressHandOfGod}`
        );
      }

      if (M.magic > spellCost + 5 && shouldPressHandOfGod) {
        M.castSpell(handOfFateSpell);
        console.log(`🪄 spell cast successfully.`);
        setGameTimeout(
          "spellCheck",
          () => {
            const updatedBuffs = Object.keys(Game.buffs).filter(
              (buff) => !ignoredBuffs.includes(buff) || buff === "Click frenzy"
            );

            if (updatedBuffs.length > appliedBuffs.length) {
              console.log(`🪄 spell triggered another buff.`);
              Game.Notify(
                `Spell triggered another buff!`,
                `<b>${new Date().toLocaleTimeString()}</b>`,
                [22, 11]
              );
            } else {
              console.log(
                `🪄 spell backfired or did not do anything important.`
              );
            }
          },
          1000
        );
      }
    }
  };

  const clickDragonAtIntervals = (counter = 0) => {
    Game.ClickSpecialPic();
    const shouldReset = ++counter > 30;

    setGameTimeout(
      "dragon",
      () => {
        clickDragonAtIntervals(shouldReset ? 0 : counter);
      },
      shouldReset ? 5000 : 100
    );
  };

  const getGardenCost = () => {
    // how many plants would need reseeding. At most, aprox. 1/3 of the garden.
    const plantsToReseed = Math.floor(
      Math.min(plotsOccupied, plotsUnlocked * 0.33)
    );
    // the cost of planting new golden clovers.
    const bankToReseedPlants =
      Game.cookiesPsRaw * (2 * 60 + 5) * 60 * plantsToReseed;

    return bankToReseedPlants;
  };

  // buy most convenient building
  const buyBestBuilding = (ignoreGarden) => {
    const gardenMaintanceCost = ignoreGarden ? 0 : getGardenCost();

    const toBuy = Game.ObjectsById.filter(
      (el) =>
        el.locked === 0 && el.bulkPrice <= Game.cookies - gardenMaintanceCost
    )
      .sort((a, b) => a.bulkPrice / a.storedCps - b.bulkPrice / b.storedCps)
      .shift();

    if (toBuy) {
      Game.ClickProduct(toBuy.id);
      const msg = `Bought ${Game.buyBulk} ${
        Game.buyBulk === 1 ? toBuy.single : toBuy.plural
      }.`;
      console.log(`💰💰💰 ${msg}`);
      Game.Notify(`💰 ${msg}`, ``, null, 10);
    }

    return toBuy;
  };

  // buy buildings automatically
  const buyBuildingsPeriodically = (withoutBuying) => {
    const toBuy = !withoutBuying ? buyBestBuilding() : null;

    setGameTimeout(
      "buyBuildings",
      buyBuildingsPeriodically,
      toBuy ? 500 : intervalAutoBuyPeriod
    );
  };

  const changeAutoBuyTimeout = (minutes) => {
    const newValue = minutes * 60000;
    if (minutes === -1) {
      buyBuildingsPeriodically();
    } else if (newValue !== intervalAutoBuyPeriod) {
      intervalAutoBuyPeriod = newValue;
      dispatchUpdate();
      console.log(
        `⏲️ autobuy timer changed to: ${Game.sayTime(
          (newValue / 1000) * Game.fps,
          -1
        )}`
      );
      buyBuildingsPeriodically(true);
    }
  };

  const reenablePledge = function () {
    if (!$.timeouts.pledge && Game.pledges) {
      const timeToNextClick = Math.ceil(Game.pledgeT / Game.fps) + 5;
      console.log(
        `setting timeout for ${Game.sayTime(Game.pledgeT, -1)} in the future.`
      );
      setGameTimeout(
        "pledge",
        () => {
          // fallback, just in case something goes wrong.
          [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) =>
            setGameTimeout(
              `pledgeRetry${i}`,
              () => {
                console.log(`clicking "Elder Pledge"`);
                Game.Upgrades["Elder Pledge"].click();
                delete $.timeouts.pledge;
              },
              10000 * i
            )
          );
        },
        timeToNextClick * 1000
      );
    }
  };

  const clearReenablePledge = function () {
    clearInterval($.intervals.pledge);
    clearTimeout($.timeouts.pledge);
    delete $.timeouts.pledge;
  };

  const refreshFools = function () {
    if (Game.season !== "fools") {
      Game.seasons["fools"].triggerUpgrade.click();
    }
  };

  const harvestRipeLump = function () {
    const shouldHarvest = Date.now() - Game.lumpT > Game.lumpRipeAge;
    if (shouldHarvest) {
      Game.clickLump();
      console.log(`Clicked sugar lump.`);
    }
  };

  const toggleActive0Loops = () => {
    $.active.key0 = !$.active.key0;
    dispatchUpdate();

    if ($.active.key0) {
      console.log(`script 0 started`);
      setGameInterval(
        "golden",
        clickGoldenCookie,
        GCOOKIE_FIXED_INTERVALS.GOLDEN
      );
      setGameInterval(
        "wrinkler",
        popWrinklers,
        GCOOKIE_FIXED_INTERVALS.WRINKLER
      );
      setGameInterval(
        "fortune",
        clickFortuneNews,
        GCOOKIE_FIXED_INTERVALS.FORTUNE
      );
      setGameInterval(
        "magic",
        () => castSpell(Game.Objects["Wizard tower"].minigame),
        GCOOKIE_FIXED_INTERVALS.MAGIC
      );
      setGameInterval("lump", harvestRipeLump, GCOOKIE_FIXED_INTERVALS.LUMP);
    } else {
      ["golden", "wrinkler", "fortune", "magic", "lump"].forEach((key) =>
        clearInterval($.intervals[key])
      );
      console.log(`script 0 stopped`);
    }
  };

  const toggleActive1Loops = () => {
    $.active.key1 = !$.active.key1;
    dispatchUpdate();

    if ($.active.key1) {
      console.log(`script 1 started`);
      setGameInterval("buyAll", Game.storeBuyAll, GCOOKIE_CONFIG.BUY_ALL);
    } else {
      clearInterval($.intervals.buyAll);
      console.log(`script 1 stopped`);
    }
  };

  const toggleActive2Loops = () => {
    $.active.key2 = !$.active.key2;
    dispatchUpdate();

    if ($.active.key2) {
      console.log(`script 2 started`);
      clickDragonAtIntervals();
    } else {
      clearTimeout($.timeouts.dragon);
      console.log(`script 2 stopped`);
    }
  };

  const toggleActive5Loops = () => {
    $.active.key5 = !$.active.key5;
    dispatchUpdate();

    if ($.active.key5) {
      console.log(`script 5 started`);
      setGameInterval(
        "refreshFools",
        refreshFools,
        GCOOKIE_FIXED_INTERVALS.REFRESH_FOOLS
      );
      setGameInterval("pledge", reenablePledge, GCOOKIE_FIXED_INTERVALS.PLEDGE);
      reenablePledge();
    } else {
      clearInterval($.intervals.refreshFools);
      clearReenablePledge();
      console.log(`script 5 stopped`);
    }
  };

  const toggleActive8Loops = () => {
    $.active.key8 = !$.active.key8;
    dispatchUpdate();

    setGameInterval(
      "farm",
      () => autoHarvestAndPlant(Game.Objects["Farm"].minigame, !$.active.key8),
      GCOOKIE_FIXED_INTERVALS.FARM
    );
    // fire harvest function immediately because of the long interval wait.
    autoHarvestAndPlant(Game.Objects["Farm"].minigame, !$.active.key8);
    console.log($.active.key8 ? `script 8 started` : `script 8 stopped`);
  };

  const toggleActive9Loops = () => {
    $.active.key9 = !$.active.key9;
    dispatchUpdate();

    if ($.active.key9) {
      console.log(`script 9 started`);
      setGameInterval(
        "clicker",
        Game.ClickCookie,
        GCOOKIE_FIXED_INTERVALS.CLICK_COOKIE
      );
    } else {
      clearInterval($.intervals.clicker);
      console.log(`script 9 stopped`);
    }
  };

  const logImportantInfo = () => {
    const frenzyTime = Game.sayTime(Game.buffs["Frenzy"]?.time ?? 0, -1);
    const rawCps = Beautify(Game.cookiesPsRaw);
    const rawClickCps = Beautify(Game.mouseCps() / 7);
    const oneLiner = `${Beautify(Game.cookiesPsRaw)} - ${Beautify(
      Game.mouseCps() / 7
    )} (${Beautify(Game.cookiesPs)} - ${Beautify(
      Game.mouseCps()
    )}) - ${Beautify(Game.BuildingsOwned)} buildings.`;
    const buildings = (html) =>
      Object.entries(Game.cookiesPsByType)
        .filter(([key, value]) => value != 0)
        .sort(([, a], [, b]) => a < b)
        .reduce(
          (str, a) =>
            (str += `${a[0]}: ${Beautify(a[1])}${html ? `<br/>` : `\n`}`),
          ``
        );

    const htmlStr = `<div><br/><br/>Frenzy time remaining: <b>${frenzyTime}</b></div>
  <div>Raw CPS: <b>${rawCps}</b></div>
  <div>Raw Click CPS: <b>${rawClickCps}</b></div>
  <div>One Liner:<br/><br/><b>${oneLiner}</b><br/><br/></div>
  <div><b>Buildings</b>:<br/>${buildings(true)}</div>`;

    const str =
      `----\n----\n` +
      `Frenzy time remaining: ${frenzyTime}\n` +
      `Raw CPS: ${rawCps}\n` +
      `Raw click CPS: ${rawClickCps}\n` +
      `One liner: \n\n${oneLiner}\n\n` +
      `Buildings: \n${buildings()}` +
      `----\n----\n`;

    Game.Notify("Important Information", htmlStr, [27, 7], 30);
    console.log(str);
  };

  /****************************************************************************************/
  /****************************************************************************************/
  // html stuff
  const create = (htmlStr) => {
    const frag = document.createDocumentFragment();
    const temp = document.createElement("div");
    temp.innerHTML = htmlStr;
    while (temp.firstChild) {
      frag.appendChild(temp.firstChild);
    }
    return frag;
  };

  const formatBool = (bool) => (bool ? `✅` : `⛔`);

  const insertStyles = () => {
    const style = document.createElement("style");
    style.textContent = `
  #gcookie-wrapper {
    position: absolute;
    z-index: 9999;
    top: 5px;
    left: 5px;
    line-height: 1.5;
    border-radius: 3px;
  }
  #gcookie {
    display: flex;
    gap: 2px;
  }
  #gcookie > li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 5px;
    background: rgba(0,0,0,0.4);
    justify-content: center;
  }
  #gcookie > li:first-child {
    border-radius: 10px 0 0 10px;
  }
  #gcookie > li:last-child {
    border-radius: 0 10px 10px 0;
  }
  #gcookie ul {
    display:flex;
    flex-wrap: wrap;
    gap: 5px;
    justify-content: space-between;
  }
  #gcookie li li:last-child {
    flex: 1;
    display: flex;
  }
  #gcookie li li:last-child .gbutton {
    flex: 1;
    white-space: nowrap;
  }
  .gbutton {
    border-radius: 3px;
  }
  .gbutton:hover:not(.disabled) {
    cursor: pointer;
    margin-top: 1px;
  }
  .gbutton.current:not(.disabled) {
    background: gold;
  }
  `;
    document.head.appendChild(style);
  };

  const addModifiers = (value) => {
    let classes = `gbutton`;
    let state = ``;
    classes +=
      Number(value) * 60000 === intervalAutoBuyPeriod ? ` current` : ``;
    if (!$.active.key5) {
      classes += ` disabled`;
      state += ` disabled`;
    }
    return `class="${classes}"${state}`;
  };

  const addTooltip = () => {
    Game.attachTooltip(
      l("gcookie-wrapper"),
      `<div style="padding:8px;width:280px;">
    <div><b>Key 0:</b>
      <ul style="padding: 3px;">
      <li>Auto: Click Golden cookies (and reindeers)</li>
      <li>Auto: Click Fortune news</li>
      <li>Auto: Pop last wrinkler</li>
      <li>Auto: Cast "Force the Hand of Fate"</li>
      <li>Auto: Click Ripe sugar Lumps</li>
      </ul>
    </div>
    <div><b>Key 1:</b>
      <ul style="padding: 3px;">
      <li>Auto: Buy upgrades periodically</li>
      </ul>
    </div>
    <div><b>Key 2:</b>
      <ul style="padding: 3px;">
      <li>Auto: Pet the Dragon</li>
      </ul>
    </div>
    <div><b>Key 3:</b>
      <ul style="padding: 3px;">
      <li>Pop all wrinklers</li>
      </ul>
    </div>
    <div><b>Key 4:</b>
      <ul style="padding: 3px;">
      <li>Buy every upgrade available</li>
      </ul>
    </div>
    <div><b>Key 5:</b>
      <ul style="padding: 3px;">
      <li>Auto: Refresh Fools season</li>
      <li>Auto: Reenable "Elder Pledge"</li>
      </ul>
    </div>
    <div><b>Key 6:</b>
      <ul style="padding: 3px;">
      <li>Buy building(s) with best benefit-cost ratio</li>
      </ul>
    </div>
    <div><b>Key 7:</b>
      <ul style="padding: 3px;">
      <li>Show/log important information</li>
      </ul>
    </div>
    <div><b>Key 8:</b>
      <ul style="padding: 3px;">
      <li>Auto: Harvest Mature plants and reseed them</li>
      </ul>
    </div>
    <div><b>Key 9:</b>
      <ul style="padding: 3px;">
      <li>Auto: Click Big Cookie</li>
      </ul>
    </div>
    </div>`,
      "this"
    );
  };

  const updateUI = () => {
    const wrapperStr = `<div id="gcookie-wrapper"><ul id="gcookie"></ul></div>`;
    const listStr = `<ul id="gcookie">
  <li>${formatBool($.active.key0)} 0</li>
  <li>${formatBool($.active.key1)} 1</li>
  <li>${formatBool($.active.key5)} 5</li>
  <li>${formatBool($.active.key8)} 8</li>
  <li>${formatBool($.active.key9)} 9</li>
  <li>${formatBool(gardenCostOverridden)} garden cost</li>
  </ul>`;

    const wrapper = create(wrapperStr);
    const existingWrapper = document.querySelector("#gcookie-wrapper");
    if (!existingWrapper) {
      document.querySelector("#sectionLeft").prepend(wrapper);
      addTooltip();
    }

    const list = create(listStr);
    const oldList = document.querySelector("#gcookie");
    oldList.replaceWith(list);
  };

  /****************************************************************************************/
  /****************************************************************************************/
  // real program

  // toggle with keys 0 and 1 for more control
  document.addEventListener(
    "keydown",
    (event) => {
      const keyName = event.key;

      if (keyName === "0") {
        toggleActive0Loops();
      }

      if (keyName === "1") {
        toggleActive1Loops();
      }

      if (keyName === "2") {
        toggleActive2Loops();
      }

      if (keyName === "3") {
        popAllWrinklers();
      }

      if (keyName === "4") {
        Game.storeBuyAll();
        console.log(`bought everything.`);
      }

      if (keyName === "5") {
        toggleActive5Loops();
      }

      if (keyName === "6") {
        buyBestBuilding(true);
      }

      if (keyName === "7") {
        logImportantInfo();
      }

      if (keyName === "8") {
        toggleActive8Loops();
      }

      if (keyName === "9") {
        toggleActive9Loops();
      }
    },
    false
  );

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("gbutton")) {
      changeAutoBuyTimeout(Number(e.target.dataset.minutes));
    }
  });

  document.addEventListener("infoUpdated", () => {
    setGameTimeout(
      "uiUpdate",
      () => {
        updateUI();
        saveCurrentState();
      },
      0
    );
  });

  // first run
  Game.volume = 0;
  Game.storeBulkButton(3);
  loadInitialState();
  insertStyles();
  overrideReindeerPopFunction();
  toggleActive0Loops();
  toggleActive1Loops();
  toggleActive5Loops();
  toggleActive8Loops();
  toggleActive9Loops();

  // award shadow achievement for using addons.
  Game.Win("Third-party");
})(gCookie);

/* market addon */
// ===================================================================================
/*
		Hello and welcome.
	This is the main file of the CookiStocker mod.
	If you came to reverse engineer the code or have more questions about the algorithm
	- you can just ask for advice in the Steam guide comments.
		https://steamcommunity.com/sharedfiles/filedetails/?id=2599187047
*/

// 			Options

// Stop trading automatically when true (not yet implemented)
var stockerStopTrading = false;

// Announce transactions in game notifications
var stockerTransactionNotifications = true;

// Make regular profit reports
var stockerActivityReport = true;

// How often to make regular reports in ms (one hour by default)
var stockerActivityReportFrequency = 1000 * 60 * 60;

// Make game notifications fade away on their own
var stockerFastNotifications = 180;

// Use console.log for more detailed info on prices and trends
var stockerConsoleAnnouncements = false;

// Logic loop frequency; do not touch it unless you are cheating
var stockerLoopFrequency = 1000 * 30;

// The cheat itself. Rolls the cycle every time logic loop triggers
var stockerForceLoopUpdates = false;

var hideBogdanoff = true;
var stockerGreeting = "click clack you are now in debt";

// ===================================================================================

if (typeof CCSE == undefined)
  Game.LoadMod(
    "https://klattmose.github.io/CookieClicker/SteamMods/CCSE/main.js"
  );

if (CookiStocker === undefined) var CookiStocker = {};

CookiStocker.name = "CookiStocker";
CookiStocker.version = "2.0";
CookiStocker.GameVersion = "2.052";

if (stockList === undefined) {
  var stockList = {
    check: "dump eet",
    goods: [],
    sessionStart: Date.now() + 500,
    sessionLastTime: Date.now() + 500,
    startingProfits: 0,
    sessionProfits: 0,
    sessionNetProfits: 0,
    sessionGrossProfits: 0,
    sessionGrossLosses: 0,
    sessionProfitableStocks: 0,
    sessionUnprofitableStocks: 0,
    sessionProfitableTrades: 0,
    sessionUnprofitableTrades: 0,
    sessionPurchases: 0,
    sessionSales: 0,
  };
}

var modeDecoder = [
  "stable",
  "slowly rising",
  "slowly falling",
  "rapidly rising",
  "rapidly falling",
  "fluctuating",
]; // meanings of each market trend (good.mode)
var goodIcons = [
  [2, 33],
  [3, 33],
  [4, 33],
  [15, 33],
  [16, 33],
  [17, 33],
  [5, 33],
  [6, 33],
  [7, 33],
  [8, 33],
  [13, 33],
  [14, 33],
  [19, 33],
  [20, 33],
  [32, 33],
  [33, 33],
  [34, 33],
  [35, 33],
];

CookiStocker.launch = function () {
  isLoaded = 1;
};

if (!CookiStocker.isLoaded) {
  if (CCSE && CCSE.isLoaded) {
    CookiStocker.launch();
  } else {
    if (!CCSE) var CCSE = {};
    if (!CCSE.postLoadHooks) CCSE.postLoadHooks = [];
    CCSE.postLoadHooks.push(CookiStocker.launch);
  }
}
/*
CookiStocker.optionsMenu = function(){
	var hStr = ' '<div class="listing">' + CCSE.MenuHelper.ActionButton("", "Unlock Hardcore Achievement") + '</div>';
}
*/
function stockerTimeBeautifier(duration) {
  var milliseconds = Math.floor((duration % 1000) / 100),
    seconds = Math.floor((duration / 1000) % 60),
    minutes = Math.floor((duration / (1000 * 60)) % 60),
    hours = Math.floor((duration / (1000 * 60 * 60)) % 24),
    days = Math.floor(duration / (1000 * 60 * 60 * 24));
  if (seconds && (minutes || hours || days) && !stockerForceLoopUpdates)
    seconds = 0; // Don't display
  var strSeconds = seconds + " second" + (seconds != 1 ? "s" : "");
  var strMinutes = minutes
    ? minutes +
      " minute" +
      (minutes != 1 ? "s" : "") +
      (seconds ? (hours || days ? ", and " : " and ") : "")
    : "";
  var strHours = hours
    ? hours +
      " hour" +
      (hours != 1 ? "s" : "") +
      (minutes && seconds
        ? ", "
        : (minutes ? !seconds : seconds)
        ? " and "
        : "")
    : "";
  var strDays = days
    ? days +
      " day" +
      (days != 1 ? "s" : "") +
      ((hours && minutes) || (hours && seconds) || (minutes && seconds)
        ? ", "
        : ((hours ? !minutes : minutes) ? !seconds : seconds)
        ? " and "
        : "")
    : "";
  var strTime = strDays + strHours + strMinutes;
  if (stockerForceLoopUpdates && seconds) strTime += strSeconds;
  if (minutes || hours || days) {
    return strTime;
  } else return strSeconds;
}

setTimeout(function waitForGame() {
  if (typeof Game === "object" && Game.ready) {
    Game.registerMod("CookiStocker", {
      init: function () {
        this.startStocking();
      },
      startStocking: function () {
        if (!Game.Objects["Bank"].minigame) {
          console.log(
            "=====$$$=== Stock Market minigame has not initialised yet! Will try again in 500 ms."
          );
          setTimeout(() => {
            this.startStocking();
          }, 500);
          return;
        }

        if (Game.Objects["Bank"].minigame.brokers < 100) {
          console.log("=====$$$=== Waiting for more brokers before starting.");
          setTimeout(() => {
            this.startStocking();
          }, 600 * 1000); // ten minutes
          return;
        }

        // #intro:start
        console.log(
          "=====$$$=== CookiStocker logic loop initialised at " + new Date()
        );
        console.log("=====$$$=== With main options as follows:");
        console.log(
          "=====$$$=== Logic loop frequency: " +
            stockerTimeBeautifier(stockerLoopFrequency)
        );
        console.log(
          "=====$$$=== Report frequency: " +
            stockerTimeBeautifier(stockerActivityReportFrequency)
        );
        console.log("=====$$$=== Cheating: " + stockerForceLoopUpdates);
        Game.Notify("CookiStocker is ready", stockerGreeting, [1, 33], false);
        console.log(stockList.check);
        // #intro:end

        var market = Game.Objects["Bank"].minigame.goodsById; // read market
        console.log("Reading the market:");
        stockList.startingProfits = Game.Objects["Bank"].minigame.profit;
        for (let i = 0; i < market.length; i++) {
          stockList.goods.push({
            name: market[i].name,
            stock: market[i].stock,
            currentPrice: market[i].val,
            mode: market[i].mode,
            lastMode: market[i].mode,
            lastDur: market[i].dur,
            unchangedDur: 0,
            dropCount: 0,
            riseCount: 0,
            profit: 0,
            someSold: false,
            someBought: false,
          });
          console.log(
            "Stock: " +
              market[i].name.replace("%1", Game.bakeryName) +
              " Status: " +
              modeDecoder[market[i].mode] +
              " at $" +
              market[i].val +
              (market[i].stock ? " (own)" : "")
          );
        }
        if (stockerForceLoopUpdates) {
          Game.Objects["Bank"].minigame.secondsPerTick =
            stockerLoopFrequency / 1000;
        }
        gCookie.stockerLoop = setInterval(function () {
          let doUpdate = false;

          // setting stockerForceLoopUpdates to true will make the logic loop force the market to tick every time it triggers,
          // making this an obvious cheat, and i will personally resent you.

          // but
          // if you backup your save and set stockerLoopFrequency to like 10 milliseconds it looks very fun and effective.
          // yes, this is how i made the gif on the steam guide page.
          if (!stockerForceLoopUpdates)
            stockerLoopFrequency =
              Game.Objects["Bank"].minigame.secondsPerTick * 500; // Keep up to date
          const smallDelta = 3;
          const largeDelta = 4;
          const alwaysBuyBelow = 2;
          const neverSellBelow = 11;

          market = Game.Objects["Bank"].minigame.goodsById; // update market
          for (let i = 0; i < market.length; i++) {
            let lastPrice = stockList.goods[i].currentPrice;
            let currentPrice = market[i].val;

            // update stockList
            stockList.goods[i].stock = market[i].stock;
            stockList.goods[i].currentPrice = market[i].val;
            stockList.goods[i].mode = market[i].mode;

            let md = stockList.goods[i].mode;
            let lmd = stockList.goods[i].lastMode;
            let lastStock = market[i].stock;
            let deltaPrice = largeDelta;
            let stockName = stockList.goods[i].name.replace(
              "%1",
              Game.bakeryName
            );

            // Our ceilingPrice is the maximum of the bank ceiling and the (deprecated but still useful) stock ceiling
            let ceilingPrice = Math.max(
              10 * (i + 1) + Game.Objects["Bank"].level + 49,
              97 + Game.Objects["Bank"].level * 3
            );

            if (Game.ObjectsById[i + 2].amount == 0) {
              // stock must be active
              console.log(`${stockName} stock is inactive`);
              continue;
            }
            if (
              lmd == md &&
              ((stockList.goods[i].stock && (md == 2 || md == 4)) || // Make selling into a downturn easier
                (!stockList.goods[i].stock && (md == 1 || md == 3)))
            )
              // Make buying into an upturn easier
              deltaPrice = smallDelta;
            if (
              md != lmd &&
              ((md == 3 && lmd != 1) ||
                (md == 4 && lmd != 2) ||
                (md == 1 && lmd != 3) ||
                (md == 2 && lmd != 4))
            ) {
              stockList.goods[i].dropCount = 0;
              stockList.goods[i].riseCount = 0;
            } else if (currentPrice > lastPrice) {
              stockList.goods[i].dropCount = 0;
              stockList.goods[i].riseCount++;
            } else if (currentPrice < lastPrice) {
              stockList.goods[i].riseCount = 0;
              stockList.goods[i].dropCount++;
            }
            if (
              stockList.goods[i].lastDur != market[i].dur ||
              ++stockList.goods[i].unchangedDur > 1
            ) {
              stockList.goods[i].unchangedDur = 0;
              doUpdate = true;
            }
            if (stockerConsoleAnnouncements && doUpdate) {
              // Tick tick
              if (md == lmd)
                console.log(
                  `${stockName} mode is unchanged at ${lmd} [${
                    modeDecoder[lmd]
                  }] at $${Beautify(currentPrice, 2)}`
                );
              else
                console.log(
                  `MODE CHANGE ${stockName} old mode was ${lmd} [${
                    modeDecoder[lmd]
                  }] and new mode is ${md} [${modeDecoder[md]}] at $${Beautify(
                    currentPrice,
                    2
                  )}`
                );
            }
            stockList.goods[i].lastDur = market[i].dur;
            if (
              // buy conditions
              (currentPrice < alwaysBuyBelow ||
                (md != 4 &&
                  ((currentPrice > lastPrice &&
                    stockList.goods[i].riseCount >= deltaPrice) ||
                    ((md == 1 || md == 3) && md != lmd) ||
                    (md == 0 &&
                      !stockList.goods[i].someSold &&
                      stockList.goods[i].dropCount < deltaPrice &&
                      currentPrice >= 10)) &&
                  (currentPrice < ceilingPrice || md == 1 || md == 3))) &&
              Game.Objects["Bank"].minigame.buyGood(i, 10000) // actual buy attempt
            ) {
              // buying
              let mode =
                lmd != md
                  ? "is no longer in " + modeDecoder[lmd] + " mode"
                  : "is ";
              let units = market[i].stock - lastStock;

              stockList.goods[i].someBought = true;
              stockList.goods[i].stock = market[i].stock;
              if (market[i].prevBuyMode1 != undefined) {
                market[i].prevBuyMode1 = lmd;
                market[i].prevBuyMode2 = md;
              }
              market[i].buyTime = Date.now();
              if (typeof StockAssistant != "undefined") {
                StockAssistant.stockData.goods[i].boughtVal = market[i].prev;
                StockAssistant.buyGood(i);
              }
              stockList.sessionPurchases++;
              if (stockerTransactionNotifications)
                if (currentPrice >= 2)
                  Game.Notify(
                    `Buying ${stockName} ${new Date().toLocaleTimeString([], {
                      hourCycle: "h23",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`,
                    `Buying ${units} unit${
                      units > 1 ? "s" : ""
                    }. The stock ${mode} at $${Beautify(
                      market[i].prev,
                      2
                    )} per unit (your buying price) and is in ${
                      modeDecoder[md]
                    } mode now.`,
                    goodIcons[i],
                    stockerFastNotifications
                  );
                else
                  Game.Notify(
                    `Buying ${stockName} ${new Date().toLocaleTimeString([], {
                      hourCycle: "h23",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`,
                    `Buying ${units} unit${
                      units > 1 ? "s" : ""
                    }. The price has dropped below $2 per unit, and your buying price is $${Beautify(
                      market[i].prev,
                      2
                    )}.`,
                    goodIcons[i],
                    stockerFastNotifications
                  );
              if (stockerConsoleAnnouncements)
                console.log(
                  "=====$$$=== Buying " +
                    stockName +
                    " at $" +
                    Beautify(market[i].prev, 2)
                );
            } else if (
              // sell conditions
              stockList.goods[i].stock > 0 &&
              ((currentPrice < lastPrice &&
                stockList.goods[i].dropCount >= deltaPrice) ||
                ((md == 2 || md == 4) && md != lmd)) &&
              currentPrice >= neverSellBelow // not near the bottom
            ) {
              // selling
              let profit = 0;
              let strProfit = "profit ";
              let mode =
                lmd != md
                  ? "is no longer in " + modeDecoder[lmd] + " mode and "
                  : "";

              if (
                !Game.Objects["Bank"].minigame.sellGood(
                  i,
                  stockList.goods[i].stock
                )
              ) {
                stockList.goods[i].lastMode = stockList.goods[i].mode; // update last mode
                continue;
              }
              stockList.goods[i].someSold = true;
              market[i].prevSale = market[i].val;
              market[i].prevSellMode1 = lmd;
              market[i].prevSellMode2 = md;
              market[i].sellTime = Date.now();
              if (typeof StockAssistant != "undefined")
                StockAssistant.sellGood(i);
              stockList.sessionSales++;
              profit =
                (market[i].val - market[i].prev) * stockList.goods[i].stock;
              stockList.goods[i].profit += profit;
              if (profit > 0) {
                stockList.sessionGrossProfits += profit;
                stockList.sessionProfitableTrades++;
              } else {
                stockList.sessionGrossLosses += -profit;
                stockList.sessionUnprofitableTrades++;
              }
              stockList.sessionNetProfits += profit;
              stockerModeProfits[lmd][md][0] += profit;
              stockerModeProfits[lmd][md][1] += profit;
              stockerModeProfits[lmd][md][2]++;
              if (profit < 0) {
                strProfit = "loss ";
                profit = -profit;
              }
              if (stockerTransactionNotifications)
                Game.Notify(
                  `Selling ${stockName} ${new Date().toLocaleTimeString([], {
                    hourCycle: "h23",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`,
                  `Selling ${stockList.goods[i].stock} unit${
                    stockList.goods[i].stock > 1 ? "s" : ""
                  } at a price of $${Beautify(
                    market[i].val,
                    2
                  )} per unit for a ${strProfit} of $${Beautify(
                    profit,
                    2
                  )} and total revenue of $${Beautify(
                    market[i].val * stockList.goods[i].stock,
                    2
                  )}, which is added to the total market profits. The stock ${mode} is in ${
                    modeDecoder[md]
                  } mode now. Bought at a price of $${Beautify(
                    market[i].prev,
                    2
                  )} per unit.`,
                  goodIcons[i],
                  stockerFastNotifications
                );
              if (stockerConsoleAnnouncements)
                console.log(
                  `=====$$$=== Selling ${stockName} at $${Beautify(
                    market[i].val,
                    2
                  )} for a ${strProfit}of $${Beautify(
                    profit,
                    2
                  )} and total revenue of $${Beautify(
                    market[i].val * stockList.goods[i].stock,
                    2
                  )}. Last bought at $${Beautify(market[i].prev, 2)}.`
                );
            }

            stockList.sessionProfits =
              Game.Objects["Bank"].minigame.profit - stockList.startingProfits;
            stockList.goods[i].lastMode = stockList.goods[i].mode; // update last mode
          }
          stockList.sessionProfitableStocks =
            stockList.sessionUnprofitableStocks = 0;
          for (let i = 0; i < market.length; i++) {
            // Must recalculate the whole list on every pass
            if (stockList.goods[i].profit > 0)
              stockList.sessionProfitableStocks++;
            else if (stockList.goods[i].profit < 0)
              stockList.sessionUnprofitableStocks++;
          }
        }, stockerLoopFrequency);

        let stockerModeProfits = [
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
        ];

        if (stockerActivityReport || stockerConsoleAnnouncements) {
          var stockerReportInterval = setInterval(function () {
            let now = Date.now();
            if (
              now >
              stockList.sessionLastTime + stockerActivityReportFrequency + 500
            ) {
              // Were we sleeping?
              stockList.sessionStart +=
                now -
                stockList.sessionLastTime -
                stockerActivityReportFrequency;
            }

            var stockerUptime =
              Math.floor((now - stockList.sessionStart) / 1000) * 1000;
            var totalStocks = 0;
            var totalShares = 0;
            var totalValue = 0;
            var unrealizedProfits = 0;
            let j, k;

            stockList.sessionLastTime = now;
            stockerUptime -= stockerUptime % stockerLoopFrequency;
            if (stockerActivityReport)
              if (stockList.sessionPurchases + stockList.sessionSales == 0) {
                Game.Notify(
                  `CookiStocker report ${new Date().toLocaleTimeString([], {
                    hourCycle: "h23",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`,
                  `This session has been running for ${stockerTimeBeautifier(
                    stockerUptime
                  )}, but no good investment opportunities were detected! Luck is not on our side, yet.`,
                  [1, 33],
                  stockerFastNotifications
                );
              } else {
                Game.Notify(
                  `CookiStocker report ${new Date().toLocaleTimeString([], {
                    hourCycle: "h23",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`,
                  `This session has been running for ${stockerTimeBeautifier(
                    stockerUptime
                  )} and has made $${Beautify(
                    stockList.sessionNetProfits,
                    0
                  )} in net profits and $${Beautify(
                    stockList.sessionProfits,
                    0
                  )} in revenue (displayed profits) in ${Beautify(
                    stockList.sessionPurchases,
                    0
                  )} purchases and ${Beautify(
                    stockList.sessionSales,
                    0
                  )} sales.`,
                  [1, 33],
                  stockerFastNotifications
                );
              }
            if (stockerConsoleAnnouncements) {
              let totalProfits = 0;
              let subtotalProfits = 0;
              let deltaTotalProfits = 0;
              let deltaSubtotalProfits = 0;
              let totalTrades = 0;
              let subtotalTrades = 0;
              let profit = 0;
              let lastProfit = 0;
              let trades = 0;
              let strProfit = "";
              let strDeltaModeProfits = "";
              let strTrades = "";

              for (j = 0; j < market.length; j++) {
                if (stockList.goods[j].stock) {
                  totalStocks++;
                  totalShares += stockList.goods[j].stock;
                  totalValue +=
                    stockList.goods[j].stock * stockList.goods[j].currentPrice;
                  unrealizedProfits +=
                    (market[j].val - market[j].prev) * stockList.goods[j].stock;
                }
              }
              console.log(
                `Running for ${stockerTimeBeautifier(
                  stockerUptime
                )} and made $${Beautify(
                  stockList.sessionNetProfits,
                  0
                )}\n  in net profits and $${Beautify(
                  stockList.sessionProfits,
                  0
                )} in revenue (displayed profits)\n  in ${Beautify(
                  stockList.sessionPurchases,
                  0
                )} purchases and ${Beautify(
                  stockList.sessionSales,
                  0
                )} sales.\nTotal number of stocks held: ${totalStocks}.  Total shares: ${Beautify(
                  totalShares,
                  0
                )}.\nTotal value: $${Beautify(
                  totalValue
                )}.  Unrealized profits: $${Beautify(
                  unrealizedProfits,
                  2
                )}.\nTotal gross profits:  $${Beautify(
                  stockList.sessionGrossProfits,
                  0
                )}.  Profitable stocks:  ${
                  stockList.sessionProfitableStocks
                }.\nProfitable trades:  ${
                  stockList.sessionProfitableTrades
                }.  Average profit per trade:  $${
                  stockList.sessionGrossProfits
                    ? Beautify(
                        stockList.sessionGrossProfits /
                          stockList.sessionProfitableTrades,
                        2
                      )
                    : 0
                }.\nTotal gross losses:  $${Beautify(
                  stockList.sessionGrossLosses,
                  0
                )}.  Unprofitable stocks:  ${
                  stockList.sessionUnprofitableStocks
                }.\nUnprofitable trades:  ${
                  stockList.sessionUnprofitableTrades
                }.  Average loss per trade:  $${
                  stockList.sessionGrossLosses
                    ? Beautify(
                        stockList.sessionGrossLosses /
                          stockList.sessionUnprofitableTrades,
                        2
                      )
                    : 0
                }.`
              );

              // Stats for individual modes
              for (j = 0; j < 6; j++)
                for (k = 0; k < 6; k++)
                  totalProfits += stockerModeProfits[j][k][0];
              for (j = 0; j < 6; j++)
                for (k = 0; k < 6; k++) {
                  profit = stockerModeProfits[j][k][0];
                  lastProfit = stockerModeProfits[j][k][1];
                  trades = stockerModeProfits[j][k][2];
                  strProfit = profit
                    ? (
                        ((100 * profit) / totalProfits).toFixed(2) + "%"
                      ).padStart(8)
                    : "";
                  strDeltaModeProfits = (
                    lastProfit ? "$" + Beautify(lastProfit, 2) : ""
                  ).padStart(14);
                  strTrades = trades
                    ? (
                        " " +
                        trades +
                        " trade" +
                        (trades > 1 ? "s" : " ")
                      ).padStart(13)
                    : "";

                  console.log(
                    `Profits[${j}][${k}] = $${Beautify(profit, 2).padEnd(
                      14
                    )} ${strProfit}${strDeltaModeProfits}${strTrades}`
                  );
                  subtotalProfits += profit;
                  deltaSubtotalProfits += lastProfit;
                  deltaTotalProfits += lastProfit;
                  subtotalTrades += trades;
                  totalTrades += trades;
                }

              // Stats for subtotals
              for (j = 0; j < 6; j++) {
                subtotalProfits = 0;
                deltaSubtotalProfits = 0;
                subtotalTrades = 0;
                for (k = 0; k < 6; k++) {
                  subtotalProfits += stockerModeProfits[j][k][0];
                  deltaSubtotalProfits += stockerModeProfits[j][k][1];
                  subtotalTrades += stockerModeProfits[j][k][2];
                  stockerModeProfits[j][k][1] = 0;
                }
                strProfit = subtotalProfits
                  ? (
                      ((100 * subtotalProfits) / totalProfits).toFixed(2) + "%"
                    ).padStart(8)
                  : "";
                strDeltaModeProfits = (
                  deltaSubtotalProfits
                    ? "$" + Beautify(deltaSubtotalProfits, 2)
                    : ""
                ).padStart(14);
                strTrades = subtotalTrades
                  ? (
                      " " +
                      subtotalTrades +
                      " trade" +
                      (subtotalTrades > 1 ? "s" : " ")
                    ).padStart(13)
                  : "";

                console.log(
                  `Subtotal[${j}]`.padEnd(14) +
                    `= $${Beautify(subtotalProfits, 2).padEnd(
                      14
                    )} ${strProfit}${strDeltaModeProfits}${strTrades}`
                );
                subtotalProfits = 0;
                deltaSubtotalProfits = 0;
                subtotalTrades = 0;
              }

              // Stats for totals
              let hourlyProfits =
                (totalProfits * (stockerLoopFrequency / 60_000) * 3600_000) /
                stockerUptime;
              let dailyProfits =
                (totalProfits * (stockerLoopFrequency / 60_000) * 86_400_000) /
                stockerUptime;

              if (!stockerForceLoopUpdates) {
                hourlyProfits *= 2;
                dailyProfits *= 2;
              }
              console.log(
                `Total profits = $${Beautify(totalProfits, 2).padEnd(
                  22
                )}${(deltaTotalProfits
                  ? "$" + Beautify(deltaTotalProfits, 2)
                  : ""
                ).padStart(15)}${
                  totalTrades
                    ? (
                        " " +
                        totalTrades +
                        " trade" +
                        (totalTrades > 1 ? "s" : " ")
                      ).padStart(13)
                    : ""
                }`
              );
              console.log(
                `Profit per hour = $${Beautify(
                  hourlyProfits,
                  2
                )}; profit per day = $${Beautify(dailyProfits, 2)}`
              );
              console.log(
                `That's ${Beautify(
                  hourlyProfits * Game.cookiesPsRawHighest,
                  2
                )} cookies and ${Beautify(
                  dailyProfits * Game.cookiesPsRawHighest,
                  2
                )} cookies, respectively. It's also ${Beautify(
                  hourlyProfits / 3600,
                  0
                )} times your highest raw cookie production rate.`
              );
              if (stockerForceLoopUpdates) {
                console.log("In unadjusted, true numbers:");
                hourlyProfits *= 60_000 / stockerLoopFrequency;
                dailyProfits *= 60_000 / stockerLoopFrequency;
                console.log(
                  `Profit per hour = $${Beautify(
                    hourlyProfits,
                    2
                  )}; profit per diem = $${Beautify(dailyProfits, 2)}`
                );
                console.log(
                  `That's ${Beautify(
                    hourlyProfits * Game.cookiesPsRawHighest,
                    2
                  )} cookies and ${Beautify(
                    dailyProfits * Game.cookiesPsRawHighest,
                    2
                  )} cookies, respectively. It's also ${Beautify(
                    hourlyProfits / 3600,
                    0
                  )} times your highest raw cookie production rate.`
                );
              }
              console.log(
                "------------------------------------------------------------------"
              );
            }
          }, stockerActivityReportFrequency);
        }
      },
    });
  } else setTimeout(waitForGame, 100);
});

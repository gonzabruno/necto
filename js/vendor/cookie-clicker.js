var gCookie = {
    active: {
        key0: false,
        key1: false,
        key2: false,
        key5: false,
    },
};

(function ($) {
    const updateEvent = new Event("infoUpdated");
    let debounceTimeout;
    let plotsUnlocked = 0;
    let plotsOccupied = 0;
    let gardenCostOverridden = false;
    let intervalFarmPeriod = 45000;
    let intervalAutoBuyPeriod = 900000;

    const dispatchUpdate = () => {
        document.dispatchEvent(updateEvent);
    };

    const loadInitialState = () => {
        const savedState =
            JSON.parse(localStorage.getItem("gcookie-data")) ?? {};
        $.active = { ...$.active, ...savedState };
    };

    const saveCurrentState = () => {
        const toSave = {
            key0: !$.active.key0,
            key1: !$.active.key1,
            key5: !$.active.key5,
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

    // auto-click golden and reindeer cookies
    const clickGoldenCookie = function () {
        Game.shimmers.forEach(function (shimmer) {
            if (
                shimmer.type == "reindeer" ||
                (shimmer.type == "golden" &&
                    (Game.elderWrath > 0 ||
                        (Game.elderWrath == 0 && shimmer.wrath == 0)))
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
    const autoHarvestAndPlant = function (M) {
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
        var shouldHarvest = nextTick < intervalFarmPeriod * 1.5;
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
                        if (me.weed || me.fungus) {
                            // kill weeds
                            M.harvest(x, y);
                            console.log(
                                `💀 killed: ${me.name} at x: ${x}, y: ${y}.`
                            );
                        } else if (age >= limit && shouldHarvest) {
                            // harvest useful plants
                            M.harvest(x, y);
                            console.log(
                                `✅ harvested: ${me.name} at x: ${x}, y: ${y}. Age: ${age}. Mature: ${me.mature}. Tick: ${me.ageTick}. Limit: ${limit}`
                            );
                            // replant them
                            M.useTool(me.id, x, y);
                            console.log(
                                `🌱 planted: ${me.name} at x: ${x}, y: ${y}.`
                            );
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

        const ignoredBuffs = ["Everything must go", "Cookie storm"];

        const buffsAppliedCount = Object.keys(Game.buffs).filter(
            (buff) => !ignoredBuffs.includes(buff)
        ).length;

        if (buffsAppliedCount > 1) {
            const handOfFateSpell = M.spellsById[1];
            const spellCost = M.getSpellCost(handOfFateSpell);

            if (M.magic > spellCost + 10) {
                M.castSpell(handOfFateSpell);
                console.log(`🪄 spell cast successfully.`);
                setTimeout(() => {
                    const updatedBuffsCount = Object.keys(Game.buffs).filter(
                        (buff) => !ignoredBuffs.includes(buff)
                    ).length;

                    if (updatedBuffsCount > buffsAppliedCount) {
                        console.log(`🪄 spell triggered another buff.`);
                        Game.Notify(
                            `🪄 spell triggered another buff at ${new Date().toLocaleTimeString()}`,
                            ``
                        );
                    } else {
                        console.log(
                            `🪄 spell backfired or did not do anything important.`
                        );
                    }
                }, 1000);
            }
        }
    };

    const getGardenCost = () => {
        // how many plants would need reseeding. At most, aprox. 2/3 of the garden.
        const plantsToReseed = Math.floor(
            Math.min(plotsOccupied, plotsUnlocked * 0.55)
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
                el.locked === 0 &&
                el.bulkPrice <= Game.cookies - gardenMaintanceCost
        )
            .sort(
                (a, b) => a.bulkPrice / a.storedCps > b.bulkPrice / b.storedCps
            )
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

        clearTimeout($.timeoutBuyBuildings);

        $.timeoutBuyBuildings = setTimeout(
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

    const toggleActive0Loops = () => {
        $.active.key0 = !$.active.key0;
        dispatchUpdate();

        if ($.active.key0) {
            console.log(`script 0 started`);
            $.intervalClicker = setInterval(Game.ClickCookie, 2);
            $.intervalGolden = setInterval(clickGoldenCookie, 500);
            $.autoPopTwelveth = setInterval(popWrinklers, 90000);
            $.intervalFarm = setInterval(
                () => autoHarvestAndPlant(Game.Objects["Farm"].minigame),
                intervalFarmPeriod
            );
            $.intervalFortune = setInterval(clickFortuneNews, 1500);
            $.intervalMagic = setInterval(
                () => castSpell(Game.Objects["Wizard tower"].minigame),
                2000
            );

            // fire harvest function immediately because of the long interval wait.
            autoHarvestAndPlant(Game.Objects["Farm"].minigame);
        } else {
            clearInterval($.intervalClicker);
            clearInterval($.intervalGolden);
            clearInterval($.intervalFortune);
            clearInterval($.intervalFarm);
            clearInterval($.intervalMagic);
            console.log(`script 0 stopped`);
        }
    };

    const toggleActive1Loops = () => {
        $.active.key1 = !$.active.key1;
        dispatchUpdate();

        if ($.active.key1) {
            console.log(`script 1 started`);
            $.intervalBuyAll = setInterval(Game.storeBuyAll, 60000);
        } else {
            clearInterval($.intervalBuyAll);
            console.log(`script 1 stopped`);
        }
    };

    const toggleActive2Loops = () => {
        $.active.key2 = !$.active.key2;
        dispatchUpdate();

        if ($.active.key2) {
            console.log(`script 2 started`);
            $.intervalPetDragon = setInterval(Game.ClickSpecialPic, 100);
        } else {
            clearInterval($.intervalPetDragon);
            console.log(`script 2 stopped`);
        }
    };

    const toggleActive5Loops = () => {
        $.active.key5 = !$.active.key5;
        dispatchUpdate();

        if ($.active.key5) {
            console.log(`script 5 started`);
            buyBuildingsPeriodically(true);
        } else {
            clearTimeout($.timeoutBuyBuildings);
            console.log(`script 5 stopped`);
        }
    };

    const logImportantInfo = () => {
        const frenzyTime = Game.sayTime(Game.buffs["Frenzy"]?.time ?? 0, -1);
        const rawCps = Beautify(Game.cookiesPsRaw);
        const rawClickCps = Beautify(Game.mouseCps() / 7);
        const oneLiner = `${Beautify(Game.cookiesPsRaw)} - ${Beautify(
            Game.mouseCps() / 7
        )} (${Beautify(Game.cookiesPs)} - ${Beautify(Game.mouseCps())})`;
        const buildings = (html) =>
            Object.entries(Game.cookiesPsByType)
                .filter(([key, value]) => value != 0)
                .sort(([, a], [, b]) => a < b)
                .reduce(
                    (str, a) =>
                        (str += `${a[0]}: ${Beautify(a[1])}${
                            html ? `<br/>` : `\n`
                        }`),
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
        style.textContent = `#gcookie {
      position: absolute;
      z-index: 9999;
      top: 5px;
      left: 5px;
      line-height: 1.5;
      background: rgba(0,0,0,0.4);
      border-radius: 3px;
      padding: 4px;
    }
    #gcookie > li {
      display: flex;
    }
    #gcookie ul {
      display:flex;
      gap: 10px;
      padding-left: 10px;
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
            '<div style="padding:8px;width:250px;text-align:center;">Back to our homepage!</div>',
            "bottom"
        );
    };

    const updateUI = () => {
        const wrapperStr = `<div id="gcookie-wrapper"><ul id="gcookie"></ul></div>`;
        const listStr = `<ul id="gcookie">
    <li>${formatBool($.active.key0)} script 0</li>
    <li>${formatBool($.active.key1)} script 1</li>
    <li>${formatBool($.active.key5)} script 5
      <ul>
        <li><button data-minutes="1" ${addModifiers(1)}>1</button></li>
        <li><button data-minutes="5" ${addModifiers(5)}>5</button></li>
        <li><button data-minutes="10" ${addModifiers(10)}>10</button></li>
        <li><button data-minutes="15" ${addModifiers(15)}>15</button></li>
        <li><button data-minutes="-1" ${addModifiers(-1)}>Run Now!</button></li>
      </ul>
    </li>
    <li>${formatBool(gardenCostOverridden)} garden cost</li>
    </ul>`;

        const wrapper = create(wrapper);
        const existingWrapper = document.querySelector("#gcookie-wrapper");
        if (!existingWrapper) {
            document.querySelector("#sectionLeft").prepend(list);
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
        },
        false
    );

    document.addEventListener("click", (e) => {
        if (e.target.classList.contains("gbutton")) {
            changeAutoBuyTimeout(Number(e.target.dataset.minutes));
        }
    });

    document.addEventListener("infoUpdated", () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            updateUI();
            saveCurrentState();
        }, 0);
    });

    // first run
    Game.volume = 0;
    Game.storeBulkButton(3);
    loadInitialState();
    insertStyles();
    toggleActive0Loops();
    toggleActive1Loops();
    toggleActive5Loops();
})(gCookie);

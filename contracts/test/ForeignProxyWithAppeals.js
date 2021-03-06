const { ethers, web3 } = require("hardhat");
const { solidity, deployMockContract } = require("ethereum-waffle");
const { time } = require("@openzeppelin/test-helpers");
const { use, expect } = require("chai");
const getContractAddress = require("../deploy-helpers/getContractAddress");

const DAIABI = require("./DAIABI.json");

use(solidity);

// BN and BigNumber are not compatible.
// Needed to manipulate time from @openzeppelin/test-helpers
const BN = web3.utils.BN;
const { BigNumber } = ethers;
const ADDRESS_ZERO = ethers.constants.AddressZero;

const arbitratorExtraData = "0x85";
const arbitrationCost = 1000;
const appealCost = 5000;
const projectID = 1;
const arbitrationID = 1;

const appealTimeOut = 180;
const winnerMultiplier = 3000;
const loserMultiplier = 7000;
const loserAppealPeriodMultiplier = 5000;
const gasPrice = 8000000;
const MAX_ANSWER = "2";

const metaEvidence = "ipfs/X";
const oneETH = BigNumber.from(BigInt(1e18));

let arbitrator;
let homeProxy;
let foreignProxy;

let governor;
let requester;
let crowdfunder1;
let crowdfunder2;
let other;

describe("Cross-chain arbitration with appeals", () => {
  beforeEach("initialize the contract", async function () {
    [governor, requester, crowdfunder1, crowdfunder2, other] = await ethers.getSigners();
    ({ arbitrator, foreignProxy, homeProxy } = await deployContracts(governor));

    // Create disputes so the index in tests will not be a default value.
    await arbitrator.connect(other).createDispute(42, arbitratorExtraData, { value: arbitrationCost });
    await arbitrator.connect(other).createDispute(4, arbitratorExtraData, { value: arbitrationCost });

    const mockDAI = await deployMockContract(governor, DAIABI.abi);
    await mockDAI.mock.transferFrom.returns(true);

    const currentTime = await time.latest();
    await homeProxy
      .connect(requester)
      .createProject(
        mockDAI.address,
        100,
        ADDRESS_ZERO,
        100,
        currentTime.add(new BN("1")).toString(),
        currentTime.add(new BN("1000")).toString(),
        1,
        "ipfshash"
      );

    await time.increase(1);

    // create dispute for invest
    await homeProxy.connect(requester).createArbitrationForInvestor(1);
  });

  it("Should correctly set the initial values", async () => {
    expect(await foreignProxy.arbitrator()).to.equal(arbitrator.address);
    expect(await foreignProxy.arbitratorExtraData()).to.equal(arbitratorExtraData);

    // 0 - winner, 1 - loser, 2 - loserAppealPeriod.
    const multipliers = await foreignProxy.getMultipliers();
    expect(multipliers[0]).to.equal(3000);
    expect(multipliers[1]).to.equal(7000);
    expect(multipliers[2]).to.equal(5000);
  });

  it("Should set correct values when requesting arbitration and fire the event", async () => {
    await expect(
      foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost - 1 })
    ).to.be.revertedWith("Deposit value too low");

    await expect(foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost }))
      .to.emit(foreignProxy, "ArbitrationRequested")
      .withArgs(projectID, await requester.getAddress());

    const arbitration = await foreignProxy.arbitrationRequests(projectID);
    expect(arbitration[0]).to.equal(1, "Incorrect status of the arbitration after creating a request");
    expect(arbitration[1]).to.equal(1000, "Deposit value stored incorrectly");

    await expect(
      foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost })
    ).to.be.revertedWith("Arbitration already requested");
  });

  it("Should set correct values when acknowledging arbitration and create a dispute", async () => {
    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: oneETH }); // Deliberately overpay

    const oldBalance = await requester.getBalance();

    await expect(foreignProxy.connect(other).receiveArbitrationAcknowledgement(projectID)).to.be.revertedWith(
      "Can only be called via bridge"
    );

    await expect(homeProxy.handleReceivedRequest(projectID))
      .to.emit(arbitrator, "DisputeCreation")
      .withArgs(2, foreignProxy.address)
      .to.emit(foreignProxy, "ArbitrationCreated")
      .withArgs(projectID, 2)
      .to.emit(foreignProxy, "Dispute")
      .withArgs(arbitrator.address, 2, 0, 1) // Arbitrator, DisputeID, MetaevidenceID, ArbitrationID
      .to.emit(homeProxy, "RequestAcknowledged")
      .withArgs(projectID);

    const arbitration = await foreignProxy.arbitrationRequests(projectID);
    expect(arbitration[0]).to.equal(2, "Incorrect status of the arbitration after acknowledging arbitration");
    expect(arbitration[1]).to.equal(0, "Deposit value should be empty");
    expect(arbitration[2]).to.equal(await requester.getAddress(), "Incorrect requester address in disputeData");
    expect(arbitration[3]).to.equal(2, "Incorrect dispute ID");

    const arbID = await foreignProxy.disputeIDToArbitrationID(2);
    expect(arbID).to.equal(arbitrationID, "Incorrect arbitration ID in disputeData");

    expect(await foreignProxy.arbitrationIDToDisputeExists(arbitrationID)).to.equal(
      true,
      "Incorrect flag after creating a dispute"
    );

    expect(await foreignProxy.getNumberOfRounds(arbitrationID)).to.equal(
      1,
      "Incorrect number of rounds after dispute creation"
    );
    expect(await foreignProxy.externalIDtoLocalID(2)).to.equal(arbitrationID, "Incorrect externalIDtoLocalID value");

    const dispute = await arbitrator.disputes(2);
    expect(dispute[0]).to.equal(foreignProxy.address, "Incorrect arbitrable address");
    expect(dispute[1]).to.equal(MAX_ANSWER, "Incorrect number of choices");
    expect(dispute[2]).to.equal(1000, "Incorrect fees value stored");

    const newBalance = await requester.getBalance();
    expect(newBalance).to.equal(oldBalance.add(oneETH).sub(arbitrationCost), "Requester was not reimbursed correctly");
  });

  it("Should cancel arbitration correctly", async () => {
    const nonExistentProjectID = 11;
    await expect(foreignProxy.connect(requester).createDisputeForProjectRequest(nonExistentProjectID, { value: 5555 }))
      .to.emit(homeProxy, "RequestRejected")
      .withArgs(nonExistentProjectID)
      .to.emit(foreignProxy, "ArbitrationRequested")
      .withArgs(nonExistentProjectID, await requester.getAddress());

    const oldBalance = await requester.getBalance();
    await expect(foreignProxy.connect(other).receiveArbitrationCancelation(nonExistentProjectID)).to.be.revertedWith(
      "Can only be called via bridge"
    );

    await expect(homeProxy.handleRejectedRequest(nonExistentProjectID))
      .to.emit(foreignProxy, "ArbitrationCanceled")
      .withArgs(nonExistentProjectID)
      .to.emit(homeProxy, "RequestCanceled")
      .withArgs(nonExistentProjectID);

    const newBalance = await requester.getBalance();
    expect(newBalance).to.equal(oldBalance.add(5555), "Requester was not reimbursed correctly");

    const arbitration = await foreignProxy.arbitrationRequests(nonExistentProjectID);
    expect(arbitration[0]).to.equal(0, "Status should be empty");
    expect(arbitration[1]).to.equal(0, "Deposit should be empty");
  });

  it("Should correctly handle failed dispute creation", async () => {
    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    const oldBalance = await requester.getBalance();
    await expect(foreignProxy.handleFailedDisputeCreation(projectID)).to.be.revertedWith("Invalid arbitration status");

    await arbitrator.setArbitrationPrice(2000); // Increase the cost so creation fails.

    await expect(homeProxy.handleReceivedRequest(projectID))
      .to.emit(foreignProxy, "ArbitrationFailed")
      .withArgs(projectID)
      .to.emit(homeProxy, "RequestAcknowledged")
      .withArgs(projectID);

    let arbitration = await foreignProxy.arbitrationRequests(projectID);
    expect(arbitration[0]).to.equal(4, "Status should be Failed");

    await expect(foreignProxy.handleFailedDisputeCreation(projectID))
      .to.emit(homeProxy, "ArbitrationFailed")
      .withArgs(projectID)
      .to.emit(foreignProxy, "ArbitrationCanceled")
      .withArgs(projectID);

    const newBalance = await requester.getBalance();
    expect(newBalance).to.equal(oldBalance.add(arbitrationCost), "Requester was not reimbursed correctly");

    arbitration = await foreignProxy.arbitrationRequests(projectID);
    expect(arbitration[0]).to.equal(0, "Status should be empty");
    expect(arbitration[1]).to.equal(0, "Deposit should be empty");
  });

  it("Should handle the ruling correctly", async () => {
    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    await homeProxy.handleReceivedRequest(projectID);
    await expect(foreignProxy.rule(2, 2)).to.be.revertedWith("Only arbitrator allowed");

    const arbAnswer = 2;

    await expect(arbitrator.giveRuling(2, arbAnswer))
      .to.emit(homeProxy, "ArbitratorAnswered")
      .withArgs(projectID, arbAnswer)
      .to.emit(foreignProxy, "Ruling")
      .withArgs(arbitrator.address, 2, arbAnswer);

    const arbitration = await foreignProxy.arbitrationRequests(projectID);
    expect(arbitration[0]).to.equal(3, "Status should be Ruled");
    expect(arbitration[3]).to.equal(2, "Stored answer is incorrect");
  });

  it("Should correctly fund an appeal and fire the events", async () => {
    let oldBalance;
    let newBalance;
    let txFundAppeal;
    let fundingStatus;
    let tx;
    let txFee;
    let roundInfo;

    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    await expect(foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 1, { value: 1000 })).to.be.revertedWith(
      "No dispute to appeal."
    );

    await homeProxy.handleReceivedRequest(projectID);
    // Check that can't fund the dispute that is not appealable.
    await expect(foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 1, { value: 1000 })).to.be.revertedWith(
      "Appeal period is over."
    );

    await arbitrator.giveAppealableRuling(2, 1, appealCost, appealTimeOut);

    await expect(foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 3, { value: 1000 })).to.be.revertedWith(
      "Answer is out of bounds"
    );

    // loserFee = appealCost + (appealCost * loserMultiplier / 10000) // 5000 + 5000 * 7/10 = 8500
    // 1st Funding ////////////////////////////////////
    oldBalance = await crowdfunder1.getBalance();
    txFundAppeal = foreignProxy
      .connect(crowdfunder1)
      .fundAppeal(arbitrationID, 2, { gasPrice: gasPrice, value: appealCost }); // This value doesn't fund fully.
    tx = await txFundAppeal;
    txFee = (await tx.wait()).gasUsed * gasPrice;

    newBalance = await crowdfunder1.getBalance();
    expect(newBalance).to.equal(
      oldBalance.sub(5000).sub(txFee),
      "The crowdfunder has incorrect balance after the first funding"
    );

    roundInfo = await foreignProxy.getRoundInfo(arbitrationID, 0);
    expect(roundInfo[1]).to.equal(0, "FeeRewards value should be 0 after partial funding");

    fundingStatus = await foreignProxy.getFundingStatus(arbitrationID, 0, 2);
    expect(fundingStatus[0]).to.equal(5000, "Incorrect amount of paidFees registered after the first funding");
    expect(fundingStatus[1]).to.equal(false, "The answer should not be fully funded after partial funding");

    await expect(txFundAppeal)
      .to.emit(foreignProxy, "Contribution")
      .withArgs(arbitrationID, 0, 2, await crowdfunder1.getAddress(), 5000); // ArbitrationID, NbRound, Ruling, Sender, Amount

    // 2nd Funding ////////////////////////////////////
    oldBalance = newBalance;
    txFundAppeal = foreignProxy
      .connect(crowdfunder1)
      .fundAppeal(arbitrationID, 2, { gasPrice: gasPrice, value: oneETH }); // Overpay to check that it's handled correctly.
    tx = await txFundAppeal;
    txFee = (await tx.wait()).gasUsed * gasPrice;
    newBalance = await crowdfunder1.getBalance();
    expect(newBalance).to.equal(
      oldBalance.sub(3500).sub(txFee),
      "The crowdfunder has incorrect balance after the second funding"
    );

    roundInfo = await foreignProxy.getRoundInfo(arbitrationID, 0);
    expect(roundInfo[0][0]).to.equal(8500, "Incorrect paidFees value of the fully funded answer");
    expect(roundInfo[1]).to.equal(8500, "Incorrect feeRewards value after the full funding");
    expect(roundInfo[2][0]).to.equal(2, "Incorrect funded answer stored");

    fundingStatus = await foreignProxy.getFundingStatus(arbitrationID, 0, 2);
    expect(fundingStatus[0]).to.equal(8500, "Incorrect amount of paidFees registered after the second funding");
    expect(fundingStatus[1]).to.equal(true, "The answer should be fully funded after the second funding");

    const contributionInfo = await foreignProxy.getContributionsToSuccessfulFundings(
      arbitrationID,
      0,
      await crowdfunder1.getAddress()
    );
    expect(contributionInfo[0][0]).to.equal(2, "Incorrect fully funded answer returned by contrbution info");
    expect(contributionInfo[1][0]).to.equal(8500, "Incorrect contribution value returned by contrbution info");

    expect(await foreignProxy.getNumberOfRounds(arbitrationID)).to.equal(1, "Number of rounds should not increase");

    await expect(txFundAppeal)
      .to.emit(foreignProxy, "Contribution")
      .withArgs(arbitrationID, 0, 2, await crowdfunder1.getAddress(), 3500)
      .to.emit(foreignProxy, "RulingFunded")
      .withArgs(arbitrationID, 0, 2);

    await expect(
      foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 2, { value: appealCost })
    ).to.be.revertedWith("Appeal fee is already paid.");
  });

  it("Should correctly create and fund subsequent appeal rounds", async () => {
    let roundInfo;
    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    await homeProxy.handleReceivedRequest(projectID);

    await arbitrator.giveAppealableRuling(2, 2, appealCost, appealTimeOut);

    await foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 1, { value: 8500 });
    await foreignProxy.connect(crowdfunder2).fundAppeal(arbitrationID, 2, { value: 5000 }); // Winner appeal fee is 6500 full.

    expect(await foreignProxy.getNumberOfRounds(arbitrationID)).to.equal(1, "Number of rounds should not increase");

    await foreignProxy.connect(crowdfunder2).fundAppeal(arbitrationID, 2, { value: 1500 });

    expect(await foreignProxy.getNumberOfRounds(arbitrationID)).to.equal(
      2,
      "Number of rounds should increase after two sides are fully funded"
    );

    roundInfo = await foreignProxy.getRoundInfo(arbitrationID, 0);
    expect(roundInfo[1]).to.equal(10000, "Incorrect feeRewards value after creating a 2nd round"); // 8500 + 6500 - 5000.

    await arbitrator.giveAppealableRuling(2, MAX_ANSWER, appealCost, appealTimeOut);

    expect(await foreignProxy.getNumberOfRounds(arbitrationID)).to.equal(2, "Number of rounds should increase to 2");

    // Check that newly created round is empty.
    roundInfo = await foreignProxy.getRoundInfo(arbitrationID, 1);
    expect(roundInfo[1]).to.equal(0, "Incorrect feeRewards value in fresh round");
  });

  it("Should not fund the appeal after the timeout", async () => {
    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    await homeProxy.handleReceivedRequest(projectID);

    await arbitrator.giveAppealableRuling(2, 2, appealCost, appealTimeOut);

    await time.increase(appealTimeOut / 2 + 1);

    // Loser.
    await expect(
      foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 1, { value: appealCost })
    ).to.be.revertedWith("Appeal period is over for loser");

    // Adding another half will cover the whole period.
    await time.increase(appealTimeOut / 2 + 1);

    // Winner.
    await expect(
      foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 2, { value: appealCost })
    ).to.be.revertedWith("Appeal period is over.");
  });

  it("Should correctly withdraw appeal fees if a dispute had winner/loser", async () => {
    let oldBalance1;
    let oldBalance2;
    let newBalance;
    let newBalance1;
    let newBalance2;
    const requesterAddress = await requester.getAddress();
    const crowdfunder1Address = await crowdfunder1.getAddress();
    const crowdfunder2Address = await crowdfunder2.getAddress();

    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    await homeProxy.handleReceivedRequest(projectID);

    await arbitrator.giveAppealableRuling(2, 1, appealCost, appealTimeOut);

    // LoserFee = 8500, WinnerFee = 6500. AppealCost = 5000.
    // 0 Round.
    await foreignProxy.connect(requester).fundAppeal(arbitrationID, 2, { value: 4000 });
    await foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 2, { value: oneETH });

    await foreignProxy.connect(crowdfunder2).fundAppeal(arbitrationID, 1, { value: 6000 });
    await foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 1, { value: 6000 });

    await arbitrator.giveAppealableRuling(2, 1, appealCost, appealTimeOut);

    // 1 Round.
    await foreignProxy.connect(requester).fundAppeal(arbitrationID, 2, { value: 500 });
    await foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 2, { value: 8000 });

    await foreignProxy.connect(crowdfunder2).fundAppeal(arbitrationID, 1, { value: 20000 });

    await arbitrator.giveAppealableRuling(2, 1, appealCost, appealTimeOut);

    // 2 Round.
    // Partially funded side should be reimbursed.
    await foreignProxy.connect(requester).fundAppeal(arbitrationID, 2, { value: 8499 });

    // Winner doesn't have to fund appeal in this case but let's check if it causes unexpected behaviour.
    await foreignProxy.connect(crowdfunder2).fundAppeal(arbitrationID, 1, { value: oneETH });

    await time.increase(appealTimeOut + 1);

    await expect(foreignProxy.withdrawFeesAndRewards(arbitrationID, requesterAddress, 0, 2)).to.be.revertedWith(
      "Dispute not resolved"
    );

    await arbitrator.executeRuling(2);

    let ruling = await arbitrator.currentRuling(2);

    const arbitration = await foreignProxy.arbitrationRequests(arbitrationID);
    expect(arbitration[0]).to.equal(3, "Status should be Ruled");
    expect(arbitration[4]).to.equal(ruling, "Stored answer is incorrect");

    const oldBalance = await requester.getBalance();
    oldBalance1 = await crowdfunder1.getBalance();
    oldBalance2 = await crowdfunder2.getBalance();

    // Withdraw 0 round.
    await foreignProxy.withdrawFeesAndRewards(arbitrationID, requesterAddress, 0, 2);

    newBalance = await requester.getBalance();
    expect(newBalance).to.equal(oldBalance, "The balance of the requester should stay the same (withdraw 0 round)");

    await foreignProxy.withdrawFeesAndRewards(arbitrationID, requesterAddress, 0, 2);

    newBalance = await requester.getBalance();
    expect(newBalance).to.equal(
      oldBalance,
      "The balance of the requester should stay the same (withdraw 0 round from winning ruling)"
    );

    await foreignProxy.withdrawFeesAndRewards(arbitrationID, crowdfunder1Address, 0, 2);

    newBalance1 = await crowdfunder1.getBalance();
    expect(newBalance1).to.equal(
      oldBalance1,
      "The balance of the crowdfunder1 should stay the same (withdraw 0 round)"
    );

    await expect(foreignProxy.withdrawFeesAndRewards(arbitrationID, crowdfunder1Address, 0, 1))
      .to.emit(foreignProxy, "Withdrawal")
      .withArgs(arbitrationID, 0, 1, crowdfunder1Address, 769); // The reward is 769 = (500/6500 * 10000)

    newBalance1 = await crowdfunder1.getBalance();
    expect(newBalance1).to.equal(
      oldBalance1.add(769),
      "The balance of the crowdfunder1 is incorrect after withdrawing from winning ruling 0 round"
    );

    oldBalance1 = newBalance1;

    await foreignProxy.withdrawFeesAndRewards(arbitrationID, crowdfunder1Address, 0, 2);

    newBalance1 = await crowdfunder1.getBalance();
    expect(newBalance1).to.equal(
      oldBalance1,
      "The balance of the crowdfunder1 should stay the same after withdrawing the 2nd time"
    );

    await foreignProxy.withdrawFeesAndRewards(arbitrationID, crowdfunder2Address, 0, 1);

    newBalance2 = await crowdfunder2.getBalance();
    // 12 / 13 * 10000 = 9230
    expect(newBalance2).to.equal(
      oldBalance2.add(9230),
      "The balance of the crowdfunder2 is incorrect (withdraw 0 round)"
    );

    oldBalance2 = newBalance2;

    let contributionInfo = await foreignProxy.getContributionsToSuccessfulFundings(
      arbitrationID,
      0,
      crowdfunder1Address
    );
    expect(contributionInfo[1][1]).to.equal(0, "Contribution of crowdfunder1 should be 0");
    contributionInfo = await foreignProxy.getContributionsToSuccessfulFundings(arbitrationID, 0, crowdfunder2Address);
    expect(contributionInfo[1][0]).to.equal(0, "Contribution of crowdfunder2 should be 0");

    // Withdraw 1 round.
    await foreignProxy.withdrawFeesAndRewards(arbitrationID, requesterAddress, 1, 2);
    await foreignProxy.withdrawFeesAndRewards(arbitrationID, requesterAddress, 1, 1);

    await foreignProxy.withdrawFeesAndRewards(arbitrationID, crowdfunder1Address, 1, 2);
    await foreignProxy.withdrawFeesAndRewards(arbitrationID, crowdfunder1Address, 1, 2);

    await foreignProxy.withdrawFeesAndRewards(arbitrationID, crowdfunder2Address, 1, 1);

    newBalance = await requester.getBalance();
    newBalance1 = await crowdfunder1.getBalance();
    newBalance2 = await crowdfunder2.getBalance();
    expect(newBalance).to.equal(oldBalance, "The balance of the requester should stay the same (withdraw 1 round)");
    expect(newBalance1).to.equal(
      oldBalance1,
      "The balance of the crowdfunder1 should stay the same (withdraw 1 round)"
    );
    expect(newBalance2).to.equal(
      oldBalance2.add(10000),
      "The balance of the crowdfunder2 is incorrect (withdraw 1 round)"
    );

    contributionInfo = await foreignProxy.getContributionsToSuccessfulFundings(arbitrationID, 1, crowdfunder2Address);
    expect(contributionInfo[1][0]).to.equal(0, "Contribution of crowdfunder2 should be 0 in 1 round");
    oldBalance2 = newBalance2;

    // Withdraw 2 round.
    await foreignProxy.withdrawFeesAndRewards(arbitrationID, requesterAddress, 2, 2);
    await foreignProxy.withdrawFeesAndRewards(arbitrationID, crowdfunder2Address, 2, 1);

    newBalance = await requester.getBalance();
    newBalance2 = await crowdfunder2.getBalance();
    expect(newBalance).to.equal(oldBalance.add(8499), "The balance of the requester is incorrect (withdraw 2 round)");
    expect(newBalance2).to.equal(
      oldBalance2.add(6500),
      "The balance of the crowdfunder2 is incorrect (withdraw 2 round)"
    );

    contributionInfo = await foreignProxy.getContributionsToSuccessfulFundings(arbitrationID, 2, crowdfunder2Address);
    expect(contributionInfo[1][0]).to.equal(0, "Contribution of crowdfunder2 should be 0 in 2 round");
  });

  it("Should correctly withdraw appeal fees if the winner did not pay the fees in the round", async () => {
    let oldBalance;
    let newBalance;

    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    await homeProxy.handleReceivedRequest(projectID);

    await arbitrator.giveAppealableRuling(2, 2, appealCost, appealTimeOut);

    // LoserFee = 8500. AppealCost = 5000.
    await foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 1, { value: 3500 });
    await foreignProxy.connect(crowdfunder2).fundAppeal(arbitrationID, 1, { value: 5000 });

    await time.increase(appealTimeOut + 1);

    await arbitrator.executeRuling(2);

    oldBalance = await crowdfunder2.getBalance();
    await foreignProxy.withdrawFeesAndRewards(arbitrationID, await crowdfunder2.getAddress(), 0, 1);
    newBalance = await crowdfunder2.getBalance();
    expect(newBalance).to.equal(oldBalance.add(5000), "The balance of the crowdfunder2 is incorrect");

    oldBalance = await crowdfunder1.getBalance();
    await foreignProxy.withdrawFeesAndRewards(arbitrationID, await crowdfunder1.getAddress(), 0, 1);
    newBalance = await crowdfunder1.getBalance();
    expect(newBalance).to.equal(oldBalance.add(3500), "The balance of the crowdfunder1 is incorrect (1 ruling)");
  });

  it("Should correctly withdraw appeal fees for multiple rounds", async () => {
    let oldBalance;
    let newBalance;

    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    await homeProxy.handleReceivedRequest(projectID);

    await arbitrator.giveAppealableRuling(2, 2, appealCost, appealTimeOut);

    // LoserFee = 8500. AppealCost = 5000.
    // WinnerFee = 6500.
    await foreignProxy.connect(requester).fundAppeal(arbitrationID, 1, { value: 5000 });
    await foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 1, { value: 3500 });

    await foreignProxy.connect(requester).fundAppeal(arbitrationID, 2, { value: 1000 });
    await foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 2, { value: 10000 });

    await arbitrator.giveAppealableRuling(2, 2, appealCost, appealTimeOut);

    await foreignProxy.connect(requester).fundAppeal(arbitrationID, 1, { value: 17 });
    await foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 2, { value: 22 });

    await time.increase(appealTimeOut + 1);

    await arbitrator.executeRuling(2);

    oldBalance = await requester.getBalance();

    await foreignProxy.withdrawFeesAndRewardsForAllRounds(arbitrationID, await requester.getAddress(), 1);
    await foreignProxy.withdrawFeesAndRewardsForAllRounds(arbitrationID, await requester.getAddress(), 2);

    newBalance = await requester.getBalance();
    // 1000 * 10000 / 6500 + 17 = 1538 + 17
    expect(newBalance).to.equal(oldBalance.add(1555), "The balance of the requester is incorrect");

    oldBalance = await crowdfunder1.getBalance();
    await foreignProxy.withdrawFeesAndRewardsForAllRounds(arbitrationID, await crowdfunder1.getAddress(), 1);
    await foreignProxy.withdrawFeesAndRewardsForAllRounds(arbitrationID, await crowdfunder1.getAddress(), 2);

    newBalance = await crowdfunder1.getBalance();
    // 5500 * 10000 / 6500 + 22 = 8461 + 22
    expect(newBalance).to.equal(oldBalance.add(8483), "The balance of the crowdfunder1 is incorrect");
  });

  it("Should switch the ruling if the loser paid appeal fees while winner did not", async () => {
    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    await homeProxy.handleReceivedRequest(projectID);

    await arbitrator.giveAppealableRuling(2, 1, appealCost, appealTimeOut);

    await foreignProxy.connect(crowdfunder1).fundAppeal(arbitrationID, 2, { value: oneETH });
    await time.increase(appealTimeOut + 1);
    await arbitrator.executeRuling(2);

    const arbitration = await foreignProxy.arbitrationRequests(arbitrationID);
    expect(arbitration[0]).to.equal(3, "Status should be Ruled");
    expect(arbitration[4]).to.equal(2, "The answer should be 2");
  });

  it("Should correctly submit evidence", async () => {
    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    await homeProxy.handleReceivedRequest(projectID);

    await expect(foreignProxy.connect(other).submitEvidence(arbitrationID, "text"))
      .to.emit(foreignProxy, "Evidence")
      .withArgs(arbitrator.address, arbitrationID, await other.getAddress(), "text");
  });

  it("Should forbid requesting arbitration after a dispute has been created for the given project", async () => {
    await foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost });

    await homeProxy.handleReceivedRequest(projectID);

    await expect(
      foreignProxy.connect(requester).createDisputeForProjectRequest(projectID, { value: arbitrationCost })
    ).to.be.revertedWith("Dispute already exists");
  });

  async function deployContracts(signer) {
    const Arbitrator = await ethers.getContractFactory("AutoAppealableArbitrator", signer);
    const arbitrator = await Arbitrator.deploy(String(arbitrationCost));

    const FxRoot = await ethers.getContractFactory("MockFxRoot", signer);
    const fxRoot = await FxRoot.deploy();

    const ForeignProxy = await ethers.getContractFactory("MockForeignArbitrationProxyWithAppeals", signer);
    const HomeProxy = await ethers.getContractFactory("MockDAISO", signer);

    const address = await signer.getAddress();
    const nonce = await signer.getTransactionCount();

    const foreignProxyAddress = getContractAddress(address, nonce);
    const homeProxyAddress = getContractAddress(address, nonce + 1);

    const foreignProxy = await ForeignProxy.deploy(
      ADDRESS_ZERO,
      fxRoot.address,
      homeProxyAddress,
      arbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      winnerMultiplier,
      loserMultiplier,
      loserAppealPeriodMultiplier
    );

    const homeProxy = await HomeProxy.deploy(
      fxRoot.address, // Here our mock FxRoot directly calls the FxChildTunnel
      foreignProxyAddress
    );

    return {
      arbitrator,
      foreignProxy,
      homeProxy,
    };
  }
});

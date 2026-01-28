import { useController } from '@/contexts/controller';
import { ellipseAddress } from '@/utils/utils';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import { Button } from '@mui/material';
import { useAccount } from '@starknet-react/core';

function WalletConnect() {
  const { isPending, playerName, login, openProfile } = useController()
  const { account, address } = useAccount();

  return (
    <>
      {account && address
        ? <Button
          loading={!playerName}
          onClick={() => openProfile()}
          startIcon={<SportsEsportsIcon />}
          color='primary'
          variant='contained'
          size='small'
          sx={{ minWidth: '100px' }}
        >
          {playerName ? playerName : ellipseAddress(address, 4, 4)}
        </Button>

        : <Button
          loading={isPending}
          variant='contained'
          color='secondary'
          onClick={() => {
            console.log("Login button clicked!");
            console.log("login function:", login);
            console.log("login function type:", typeof login);
            try {
              login();
              console.log("login() called successfully");
            } catch (error) {
              console.error("Error calling login():", error);
            }
          }}
          size='small'
          startIcon={<SportsEsportsIcon />}
          sx={{ minWidth: '100px' }}
        >
          Log In
        </Button>
      }
    </>
  );
}

export default WalletConnect
